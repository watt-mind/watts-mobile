import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { friendlyError } from '@/src/api/errors';
import { parseQuotaError, type QuotaInfo } from '@/src/features/subscriptions/quota';
import { getInstanceUrl } from '@/src/config/instance';
import type { RecoveryContextItem } from '@/src/features/recovery/types';
import { filterActiveToday } from '@/src/features/recovery/mapRecovery';
import { RECOVERY_CONTEXT_KEY } from '@/src/features/recovery/useRecovery';
import type { TodayViewModel } from '@/src/features/today/types';
import { TODAY_QUERY_KEY } from '@/src/features/today/useToday';

import {
  createChatRoom,
  fetchChatMessages,
  fetchChatRooms,
  fetchRoomState,
  fetchWebsocketToken,
  resumeChatTurn,
  retryChatTurn,
  submitChatToolApproval,
  uploadChatImage,
  websocketUrlFromInstance,
} from './api';
import { captureChatPhoto, pickChatImagesFromLibrary } from './attachments';
import { CHAT_ROOMS_QUERY_KEY, chatMessagesQueryKey } from './chatQueryKeys';
import { coachChatFetch, resolveChatMessagesApiUrl } from './coachFetch';
import {
  applyAssistantTextDelta,
  hasActiveTurn,
  hydrateCoachMessages,
  isActiveTurnStatus,
  isTerminalTurnStatus,
  mergeLoadedMessages,
  displayMessageText,
  upsertChatMessage,
  visibleCoachMessages,
} from './mapMessages';
import {
  coalescePendingLoad,
  resolveFollowUpLoad,
  shouldApplyMessageLoad,
  type MessageLoadRequest,
} from './messageLoadCoalesce';
import { buildCoachSeedContext, buildSessionCoachSeedContext, withSeedPrefix } from './seedContext';
import { takeSessionDiscuss } from './sessionDiscussStore';
import { decideSessionOpen, findRoomById } from './sessionPolicy';
import { shouldApplyStreamCallback } from './streamGeneration';
import {
  countAssistantMessages,
  shouldClearAwaitingTurnStart,
  shouldPollTurn,
  shouldStopTurnPolling,
} from './turnPolling';
import type {
  ChatRoomSummary,
  CoachUIMessage,
  PendingAttachment,
  StoredChatMessage,
} from './types';

const POLL_INTERVAL_MS = 1500;
const POLL_GRACE_MS = 15000;
const WS_RECONNECT_MS = 3000;
const WS_PING_MS = 30000;

export type UseCoachChatOptions = {
  targetRoomId?: string | null;
};

type UseCoachChatResult = {
  roomId: string | null;
  roomName: string | null;
  isReadOnly: boolean;
  rooms: ChatRoomSummary[];
  roomsLoading: boolean;
  roomListOpen: boolean;
  setRoomListOpen: (open: boolean) => void;
  messages: CoachUIMessage[];
  displayMessages: CoachUIMessage[];
  input: string;
  setInput: (value: string) => void;
  pendingAttachments: PendingAttachment[];
  loading: boolean;
  sending: boolean;
  streaming: boolean;
  awaitingReply: boolean;
  isRealtimeConnected: boolean;
  usingPollFallback: boolean;
  error: string | null;
  sendError: string | null;
  /** Set when the reply was blocked by a plan limit rather than a failure. */
  sendQuota: QuotaInfo | null;
  notice: string | null;
  send: (text?: string) => Promise<void>;
  applyStarter: (text: string) => void;
  resumeTurn: () => Promise<void>;
  retryTurn: () => Promise<void>;
  recoverableTurnId: string | null;
  recoverableStatus: string | null;
  refresh: () => Promise<void>;
  selectRoom: (roomId: string) => Promise<void>;
  createRoom: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  attachFromLibrary: () => Promise<void>;
  attachFromCamera: () => Promise<void>;
  removeAttachment: (id: string) => void;
  submitToolApproval: (approval: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }) => Promise<void>;
};

export function useCoachChat(options: UseCoachChatOptions = {}): UseCoachChatResult {
  const queryClient = useQueryClient();
  const targetRoomId = options.targetRoomId ?? null;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomListOpen, setRoomListOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendQuota, setSendQuota] = useState<QuotaInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [awaitingTurnStart, setAwaitingTurnStart] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [usingPollFallback, setUsingPollFallback] = useState(false);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [seedUsed, setSeedUsed] = useState(false);

  const roomIdRef = useRef<string | null>(null);
  const awaitingTurnStartRef = useRef(false);
  const messagesRef = useRef<CoachUIMessage[]>([]);
  const activeRef = useRef(true);
  const seedUsedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsPingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollGraceUntil = useRef(0);
  // Assistant-message count captured when the grace window was armed. A reply
  // has landed only when the live count exceeds it — "the thread contains an
  // assistant message" is true in every ongoing chat and is not evidence.
  const assistantBaseline = useRef(0);
  const loadInFlight = useRef(false);
  const pendingLoad = useRef<MessageLoadRequest | null>(null);
  const loadGeneration = useRef(0);
  // Bumped on every room switch; guards useChat's onFinish/onError against
  // acting on a stream started for a room that is no longer active.
  const roomGeneration = useRef(0);
  const sendGeneration = useRef(0);
  const setMessagesRef = useRef<(messages: CoachUIMessage[]) => void>(() => {});
  const restartTurnPollingRef = useRef<(options?: { forceForMs?: number }) => void>(() => {});
  const loadMessagesRef = useRef<(id: string, options?: { silent?: boolean }) => Promise<void>>(
    async () => {},
  );
  const isRealtimeConnectedRef = useRef(false);
  const approvalInFlight = useRef(new Set<string>());
  const bootstrappedForTarget = useRef<string | null | undefined>(undefined);
  const bootstrapRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    awaitingTurnStartRef.current = awaitingTurnStart;
  }, [awaitingTurnStart]);

  /**
   * Flip the awaiting flag on the ref and the state together.
   *
   * The ref used to be synced only by the effect above, which does not run
   * until after render — far too late for `restartTurnPolling()`, which
   * `send()` calls synchronously in the same tick. The poll timer therefore
   * read a stale `false` and never started (CW-488).
   */
  const setAwaitingTurn = useCallback((value: boolean) => {
    awaitingTurnStartRef.current = value;
    setAwaitingTurnStart(value);
  }, []);

  useEffect(() => {
    seedUsedRef.current = seedUsed;
  }, [seedUsed]);

  useEffect(() => {
    isRealtimeConnectedRef.current = isRealtimeConnected;
  }, [isRealtimeConnected]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const resolveApiUrl = useCallback(async () => {
    try {
      const url = await resolveChatMessagesApiUrl();
      if (activeRef.current) {
        setApiUrl(url);
      }
      return url;
    } catch (err) {
      if (activeRef.current) {
        setError(friendlyError(err, 'Could not resolve chat API'));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveChatMessagesApiUrl()
      .then((url) => {
        if (!cancelled && activeRef.current) {
          setApiUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled && activeRef.current) {
          setError(friendlyError(err, 'Could not resolve chat API'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl || 'http://127.0.0.1/api/chat/messages',
        fetch: coachChatFetch as unknown as typeof globalThis.fetch,
        body: () => ({
          roomId,
        }),
        headers: () => ({
          Accept: 'text/event-stream, application/json',
        }),
      }),
    [apiUrl, roomId],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    stop,
    status,
    error: chatError,
    clearError,
  } = useChat<CoachUIMessage>({
    transport,
    onFinish: () => {
      // A stale callback from a room we've since switched away from — ignore it
      // so it can't resurrect the composer/typing state or write into the new
      // room's messages.
      if (!shouldApplyStreamCallback(sendGeneration.current, roomGeneration.current)) return;
      setAwaitingTurn(false);
      const id = roomIdRef.current;
      if (id) {
        // No forced grace window here: the stream already delivered this turn.
        // The silent reload re-runs restartTurnPolling with fresh messages, so a
        // follow-up turn (e.g. a tool continuation) still starts the timer,
        // without polling for 15s after every ordinary reply.
        void loadMessagesRef.current(id, { silent: true });
        restartTurnPollingRef.current();
      }
    },
    onError: (err) => {
      if (!shouldApplyStreamCallback(sendGeneration.current, roomGeneration.current)) return;
      setAwaitingTurn(false);
      const quota = parseQuotaError(err, 'COACH_CHAT');
      setSendQuota(quota);
      setSendError(quota ? null : friendlyError(err, 'Failed to send message'));
    },
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const stopTurnPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const loadMessages = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      if (!activeRef.current) return;
      const silent = options?.silent ?? false;
      const request: MessageLoadRequest = { roomId: id, silent };

      if (loadInFlight.current) {
        pendingLoad.current = coalescePendingLoad(pendingLoad.current, request, roomIdRef.current);
        if (!silent) setLoading(true);
        return;
      }

      loadInFlight.current = true;
      const targetId = id;
      const targetSilent = silent;
      // Clear any coalesce entry for this start; later requests re-queue via pendingLoad.
      if (pendingLoad.current?.roomId === targetId) {
        pendingLoad.current = null;
      }
      const generation = ++loadGeneration.current;

      try {
        if (!targetSilent) setLoading(true);
        const loaded = await fetchChatMessages(targetId);
        if (
          !shouldApplyMessageLoad({
            isActive: activeRef.current,
            requestGeneration: generation,
            currentGeneration: loadGeneration.current,
            requestedRoomId: targetId,
            activeRoomId: roomIdRef.current,
          })
        ) {
          return;
        }
        queryClient.setQueryData(chatMessagesQueryKey(targetId), loaded);
        const transformed = hydrateCoachMessages(loaded);
        const merged = mergeLoadedMessages(messagesRef.current, transformed);
        messagesRef.current = merged;
        setMessagesRef.current(merged);
        if (
          shouldClearAwaitingTurnStart({
            hasActiveTurn: hasActiveTurn(merged),
            assistantCount: countAssistantMessages(merged),
            assistantBaseline: assistantBaseline.current,
          })
        ) {
          setAwaitingTurn(false);
        }
        if (transformed.length > 0) {
          setSeedUsed(true);
        }
        setError(null);
        restartTurnPollingRef.current();
      } catch (err) {
        if (
          !shouldApplyMessageLoad({
            isActive: activeRef.current,
            requestGeneration: generation,
            currentGeneration: loadGeneration.current,
            requestedRoomId: targetId,
            activeRoomId: roomIdRef.current,
          })
        ) {
          return;
        }
        const cached = queryClient.getQueryData<StoredChatMessage[]>(
          chatMessagesQueryKey(targetId),
        );
        if (cached && cached.length > 0 && (!targetSilent || messagesRef.current.length === 0)) {
          const transformed = hydrateCoachMessages(cached);
          messagesRef.current = transformed;
          setMessagesRef.current(transformed);
          if (transformed.length > 0) setSeedUsed(true);
          setError(null);
          setNotice('You’re offline — showing last saved chat');
        } else if (!targetSilent) {
          setError(friendlyError(err, 'Failed to load messages'));
        }
      } finally {
        loadInFlight.current = false;
        const followUp = resolveFollowUpLoad({
          pending: pendingLoad.current,
          activeRoomId: roomIdRef.current,
          completedRoomId: targetId,
        });
        if (followUp) {
          pendingLoad.current = null;
          void loadMessagesRef.current(followUp.roomId, { silent: followUp.silent });
        } else if (!targetSilent) {
          setLoading(false);
        }
      }
    },
    [queryClient, setAwaitingTurn],
  );

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  const restartTurnPolling = useCallback(
    (options?: { forceForMs?: number }) => {
      if (!activeRef.current) return;
      if (options?.forceForMs && options.forceForMs > 0) {
        pollGraceUntil.current = Date.now() + options.forceForMs;
        // Snapshot what "already replied" looks like right now, so the reply we
        // are about to wait for is distinguishable from the previous one.
        assistantBaseline.current = countAssistantMessages(messagesRef.current);
      }

      stopTurnPolling();

      const id = roomIdRef.current;
      if (
        !shouldPollTurn({
          roomId: id,
          hasActiveTurn: hasActiveTurn(messagesRef.current),
          awaitingTurnStart: awaitingTurnStartRef.current,
          assistantCount: countAssistantMessages(messagesRef.current),
          assistantBaseline: assistantBaseline.current,
          pollGraceUntil: pollGraceUntil.current,
          now: Date.now(),
        })
      ) {
        setUsingPollFallback(false);
        return;
      }

      setUsingPollFallback(!isRealtimeConnectedRef.current);

      pollTimer.current = setInterval(async () => {
        if (!activeRef.current || !roomIdRef.current) {
          stopTurnPolling();
          return;
        }

        const currentId = roomIdRef.current;
        let nextHasActiveTurn = hasActiveTurn(messagesRef.current);

        try {
          const roomState = await fetchRoomState(currentId);
          nextHasActiveTurn = isActiveTurnStatus(roomState.activeTurnStatus);

          if (
            nextHasActiveTurn ||
            awaitingTurnStartRef.current ||
            hasActiveTurn(messagesRef.current)
          ) {
            await loadMessagesRef.current(currentId, { silent: true });
            nextHasActiveTurn = hasActiveTurn(messagesRef.current);
          }
        } catch {
          try {
            await loadMessagesRef.current(currentId, { silent: true });
            nextHasActiveTurn = hasActiveTurn(messagesRef.current);
          } catch {
            // ignore
          }
        }

        if (
          shouldStopTurnPolling({
            roomId: roomIdRef.current,
            hasActiveTurn: nextHasActiveTurn,
            awaitingTurnStart: awaitingTurnStartRef.current,
            assistantCount: countAssistantMessages(messagesRef.current),
            assistantBaseline: assistantBaseline.current,
            pollGraceUntil: pollGraceUntil.current,
            now: Date.now(),
          })
        ) {
          stopTurnPolling();
          setUsingPollFallback(false);
        }
      }, POLL_INTERVAL_MS);
    },
    [stopTurnPolling],
  );

  const cleanupWebSocket = useCallback(() => {
    if (wsReconnectTimer.current) {
      clearTimeout(wsReconnectTimer.current);
      wsReconnectTimer.current = null;
    }
    if (wsPingTimer.current) {
      clearInterval(wsPingTimer.current);
      wsPingTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsRealtimeConnected(false);
  }, []);

  const connectWebSocketRef = useRef<() => Promise<void>>(async () => {});

  const connectWebSocket = useCallback(async () => {
    if (!activeRef.current || wsRef.current) return;

    const instanceBaseUrl = await getInstanceUrl();
    if (!instanceBaseUrl) {
      setUsingPollFallback(true);
      restartTurnPollingRef.current({ forceForMs: POLL_GRACE_MS });
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(websocketUrlFromInstance(instanceBaseUrl));
    } catch {
      setUsingPollFallback(true);
      restartTurnPollingRef.current({ forceForMs: POLL_GRACE_MS });
      return;
    }

    wsRef.current = socket;
    setIsRealtimeConnected(false);

    socket.onopen = async () => {
      try {
        const token = await fetchWebsocketToken();
        socket.send(JSON.stringify({ type: 'authenticate', token }));
        if (wsPingTimer.current) clearInterval(wsPingTimer.current);
        wsPingTimer.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send('ping');
          }
        }, WS_PING_MS);
      } catch {
        setUsingPollFallback(true);
        restartTurnPollingRef.current({ forceForMs: POLL_GRACE_MS });
        socket.close();
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as {
          type?: string;
          roomId?: string;
          turnId?: string;
          messageId?: string;
          textDelta?: string;
          status?: string;
          message?: StoredChatMessage;
        };

        if (data.type === 'authenticated') {
          setIsRealtimeConnected(true);
          setUsingPollFallback(false);
          const id = roomIdRef.current;
          if (id) void loadMessagesRef.current(id, { silent: true });
          return;
        }

        const currentRoom = roomIdRef.current;
        if (!currentRoom || data.roomId !== currentRoom) return;

        if (
          data.type === 'chat_assistant_text_delta' &&
          typeof data.textDelta === 'string' &&
          data.messageId &&
          data.turnId
        ) {
          setAwaitingTurn(false);
          {
            const next = applyAssistantTextDelta(messagesRef.current, {
              messageId: data.messageId,
              turnId: data.turnId,
              textDelta: data.textDelta,
              status: data.status,
            });
            messagesRef.current = next;
            setMessagesRef.current(next);
          }
          return;
        }

        if (data.type === 'chat_message_upsert' && data.message) {
          if (
            data.message.role === 'assistant' ||
            isActiveTurnStatus(data.message.metadata?.turnStatus)
          ) {
            setAwaitingTurn(false);
          }
          {
            const next = upsertChatMessage(messagesRef.current, data.message);
            messagesRef.current = next;
            setMessagesRef.current(next);
          }
          if (
            data.message.role === 'assistant' &&
            isTerminalTurnStatus(data.message.metadata?.turnStatus)
          ) {
            void loadMessagesRef.current(currentRoom, { silent: true });
          }
          return;
        }

        if (data.type === 'chat_turn_status' && data.turnId) {
          if (isTerminalTurnStatus(data.status)) {
            setAwaitingTurn(false);
            void loadMessagesRef.current(currentRoom, { silent: true });
          }
        }
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
      setIsRealtimeConnected(false);
      if (wsPingTimer.current) {
        clearInterval(wsPingTimer.current);
        wsPingTimer.current = null;
      }
      if (hasActiveTurn(messagesRef.current) || awaitingTurnStartRef.current) {
        setUsingPollFallback(true);
        restartTurnPollingRef.current({ forceForMs: POLL_GRACE_MS });
      }

      if (activeRef.current) {
        wsReconnectTimer.current = setTimeout(() => {
          wsReconnectTimer.current = null;
          if (activeRef.current) {
            void connectWebSocketRef.current();
          }
        }, WS_RECONNECT_MS);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }, [setAwaitingTurn]);

  useEffect(() => {
    restartTurnPollingRef.current = restartTurnPolling;
    connectWebSocketRef.current = connectWebSocket;
  }, [restartTurnPolling, connectWebSocket]);

  const applyActiveRoom = useCallback(
    async (room: ChatRoomSummary, options?: { clearMessages?: boolean }) => {
      // Stop any in-flight reply stream for the room we're leaving — otherwise
      // its late text-delta/onFinish/onError callbacks can keep writing into
      // the new room's messages, and the turn poll can never stop while
      // `awaiting` stays true (CW-165).
      stop();
      roomGeneration.current += 1;
      stopTurnPolling();
      pollGraceUntil.current = 0;
      assistantBaseline.current = 0;
      setAwaitingTurn(false);
      clearError();

      setRoomId(room.roomId);
      setRoomName(room.roomName || 'Coach Watts');
      setIsReadOnly(Boolean(room.isReadOnly));
      roomIdRef.current = room.roomId;
      // Invalidate any in-flight fetch for the previous room.
      loadGeneration.current += 1;
      setSeedUsed(false);
      setPendingAttachments([]);
      setSendError(null);
      setSendQuota(null);
      setInput('');
      if (options?.clearMessages !== false) {
        // Update the ref synchronously too — setMessages/messagesRef sync
        // otherwise happens via a render-driven effect, leaving a brief window
        // where hasActiveTurn(messagesRef.current) still sees the old room's
        // messages (e.g. from restartTurnPolling running before that effect).
        messagesRef.current = [];
        setMessagesRef.current([]);
      }
      await loadMessages(room.roomId);
    },
    [clearError, loadMessages, setAwaitingTurn, stop, stopTurnPolling],
  );

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const loaded = await fetchChatRooms();
      if (!activeRef.current) return;
      queryClient.setQueryData(CHAT_ROOMS_QUERY_KEY, loaded);
      setRooms(loaded);
    } catch {
      const cached = queryClient.getQueryData<ChatRoomSummary[]>(CHAT_ROOMS_QUERY_KEY);
      if (cached && activeRef.current) setRooms(cached);
    } finally {
      if (activeRef.current) setRoomsLoading(false);
    }
  }, [queryClient]);

  const selectRoom = useCallback(
    async (nextRoomId: string) => {
      // Close the sheet BEFORE any async work: flipping the pageSheet Modal's
      // `visible` while the owner re-renders mid-transition can orphan an empty,
      // undismissable sheet over the app (issue 060).
      setRoomListOpen(false);
      const room = rooms.find((item) => item.roomId === nextRoomId);
      if (!room) {
        const loaded = await fetchChatRooms();
        setRooms(loaded);
        const found = findRoomById(loaded, nextRoomId);
        if (!found) {
          setNotice('Chat not found. Opening a session instead.');
          const decision = decideSessionOpen(loaded);
          if (decision.action === 'select') {
            await applyActiveRoom(decision.room);
          } else {
            const created = await createChatRoom();
            setRooms((prev) => [created, ...prev.filter((r) => r.roomId !== created.roomId)]);
            await applyActiveRoom(created);
          }
          return;
        }
        await applyActiveRoom(found);
        return;
      }
      await applyActiveRoom(room);
    },
    [applyActiveRoom, rooms],
  );

  const createRoom = useCallback(async () => {
    // Close the sheet before async work — see selectRoom / issue 060.
    setRoomListOpen(false);
    setSendError(null);
    try {
      const created = await createChatRoom();
      setRooms((prev) => [created, ...prev.filter((r) => r.roomId !== created.roomId)]);
      await applyActiveRoom(created);
      setNotice(null);
    } catch (err) {
      setSendError(friendlyError(err, 'Failed to create chat'));
    }
  }, [applyActiveRoom]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Avoid re-bootstrapping the same target repeatedly (e.g. focus), but re-run when target changes.
      if (bootstrappedForTarget.current === targetRoomId && roomIdRef.current) {
        return;
      }
      bootstrappedForTarget.current = targetRoomId;

      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const loadedRooms = await fetchChatRooms();
        if (cancelled || !activeRef.current) return;
        queryClient.setQueryData(CHAT_ROOMS_QUERY_KEY, loadedRooms);
        setRooms(loadedRooms);

        if (targetRoomId) {
          const targeted = findRoomById(loadedRooms, targetRoomId);
          if (targeted) {
            await applyActiveRoom(targeted);
            void connectWebSocket();
            return;
          }
          setNotice('Chat not found. Starting a session instead.');
        }

        const decision = decideSessionOpen(loadedRooms);
        if (decision.action === 'select') {
          await applyActiveRoom(decision.room);
        } else {
          const created = await createChatRoom();
          if (cancelled || !activeRef.current) return;
          queryClient.setQueryData(CHAT_ROOMS_QUERY_KEY, (prev: ChatRoomSummary[] | undefined) => [
            created,
            ...(prev ?? loadedRooms).filter((r) => r.roomId !== created.roomId),
          ]);
          setRooms((prev) => [created, ...prev.filter((r) => r.roomId !== created.roomId)]);
          await applyActiveRoom(created);
        }
        void connectWebSocket();
      } catch (err) {
        if (cancelled || !activeRef.current) return;
        const cachedRooms = queryClient.getQueryData<ChatRoomSummary[]>(CHAT_ROOMS_QUERY_KEY);
        if (cachedRooms && cachedRooms.length > 0) {
          setRooms(cachedRooms);
          setNotice('You’re offline — showing last saved chat');
          const targeted = targetRoomId ? findRoomById(cachedRooms, targetRoomId) : null;
          const decision = targeted
            ? { action: 'select' as const, room: targeted }
            : decideSessionOpen(cachedRooms);
          // Can't create rooms offline — reopen last cached room as a fallback.
          const room = decision.action === 'select' ? decision.room : cachedRooms[0];
          if (room) {
            await applyActiveRoom(room);
          } else {
            setError(friendlyError(err, 'Failed to open Coach chat'));
            setLoading(false);
          }
          return;
        }
        setError(friendlyError(err, 'Failed to open Coach chat'));
        setLoading(false);
      }
    }

    bootstrapRef.current = bootstrap;
    void bootstrap();

    return () => {
      cancelled = true;
    };
    // Intentionally re-run when deep-link room target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRoomId]);

  useEffect(() => {
    return () => {
      stopTurnPolling();
      cleanupWebSocket();
    };
  }, [cleanupWebSocket, stopTurnPolling]);

  const streaming = status === 'streaming' || hasActiveTurn(messages) || awaitingTurnStart;
  const sending = status === 'submitted' || status === 'streaming';

  const recoverable = useMemo(() => {
    const latest = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'assistant' &&
          (m.metadata?.turnStatus === 'INTERRUPTED' || m.metadata?.turnStatus === 'FAILED'),
      );
    return {
      turnId: (latest?.metadata?.turnId as string | undefined) || null,
      status: latest?.metadata?.turnStatus || null,
    };
  }, [messages]);

  const ensureAttachmentsUploaded = useCallback(async (): Promise<PendingAttachment[]> => {
    const next = [...pendingAttachments];
    for (let i = 0; i < next.length; i += 1) {
      const item = next[i];
      if (!item || item.uploadedUrl) continue;
      next[i] = { ...item, uploading: true, error: null };
      setPendingAttachments([...next]);
      try {
        const uploaded = await uploadChatImage({
          uri: item.localUri,
          mediaType: item.mediaType,
          filename: item.filename,
        });
        next[i] = {
          ...item,
          uploading: false,
          uploadedUrl: uploaded.url,
          filename: uploaded.filename || item.filename,
          error: null,
        };
      } catch (err) {
        next[i] = {
          ...item,
          uploading: false,
          error: friendlyError(err, 'Upload failed'),
        };
        setPendingAttachments([...next]);
        throw new Error(next[i]?.error || 'Upload failed');
      }
      setPendingAttachments([...next]);
    }
    return next;
  }, [pendingAttachments]);

  const send = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? input).trim();
      if (!roomIdRef.current || !apiUrl) return;
      if (isReadOnly) {
        setSendError('This chat is read-only. Start a new chat to continue.');
        return;
      }
      if (!text && pendingAttachments.length === 0) return;

      setSendError(null);
      clearError();

      let uploaded: PendingAttachment[] = [];
      try {
        uploaded = await ensureAttachmentsUploaded();
      } catch (err) {
        setSendError(friendlyError(err, 'Failed to upload photo'));
        return;
      }

      let outbound = text;
      if (!seedUsedRef.current && messagesRef.current.length === 0 && text) {
        const session = takeSessionDiscuss();
        const sessionSeed = session ? buildSessionCoachSeedContext(session) : null;
        const today = queryClient.getQueryData<TodayViewModel>(TODAY_QUERY_KEY);
        const recoveryWindow =
          queryClient.getQueryData<RecoveryContextItem[]>(RECOVERY_CONTEXT_KEY);
        const recovery = recoveryWindow ? filterActiveToday(recoveryWindow) : undefined;
        const seed = sessionSeed || buildCoachSeedContext({ today, activeRecovery: recovery });
        outbound = withSeedPrefix(text, seed);
        setSeedUsed(true);
      } else if (!seedUsedRef.current && messagesRef.current.length === 0) {
        setSeedUsed(true);
      }

      const parts: Record<string, unknown>[] = [];
      if (outbound) {
        parts.push({ type: 'text', text: outbound });
      }
      for (const attachment of uploaded) {
        if (!attachment.uploadedUrl) continue;
        parts.push({
          type: 'file',
          url: attachment.uploadedUrl,
          mediaType: attachment.mediaType,
          filename: attachment.filename,
        });
      }

      setInput('');
      setPendingAttachments([]);
      setAwaitingTurn(true);
      // Tag this stream with the room generation live right now, so a late
      // onFinish/onError firing after a room switch can recognize itself as
      // stale (see shouldApplyStreamCallback) instead of touching the new room.
      sendGeneration.current = roomGeneration.current;
      restartTurnPolling({ forceForMs: POLL_GRACE_MS });

      try {
        if (parts.length > 0) {
          await sendMessage({
            role: 'user',
            parts,
          } as Parameters<typeof sendMessage>[0]);
        } else {
          await sendMessage({ text: outbound || ' ' });
        }
      } catch (err) {
        setAwaitingTurn(false);
        setSendError(friendlyError(err, 'Failed to send message'));
        setInput(text);
        setPendingAttachments(uploaded.map((item) => ({ ...item, uploading: false })));
      }
    },
    [
      apiUrl,
      clearError,
      ensureAttachmentsUploaded,
      input,
      isReadOnly,
      pendingAttachments.length,
      queryClient,
      restartTurnPolling,
      sendMessage,
      setAwaitingTurn,
    ],
  );

  const applyStarter = useCallback((text: string) => {
    setInput(text);
  }, []);

  const attachFromLibrary = useCallback(async () => {
    if (isReadOnly) return;
    const result = await pickChatImagesFromLibrary(pendingAttachments.length);
    if (!result.ok) {
      if (result.reason !== 'cancelled') setSendError(result.message);
      return;
    }
    setSendError(null);
    setPendingAttachments((prev) => [...prev, ...result.attachments]);
  }, [isReadOnly, pendingAttachments.length]);

  const attachFromCamera = useCallback(async () => {
    if (isReadOnly) return;
    const result = await captureChatPhoto(pendingAttachments.length);
    if (!result.ok) {
      if (result.reason !== 'cancelled') setSendError(result.message);
      return;
    }
    setSendError(null);
    setPendingAttachments((prev) => [...prev, ...result.attachments]);
  }, [isReadOnly, pendingAttachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const submitToolApproval = useCallback(
    async (approval: { approvalId: string; approved: boolean; reason?: string }) => {
      const currentRoomId = roomIdRef.current;
      if (!currentRoomId) return;
      if (approvalInFlight.current.has(approval.approvalId)) return;
      approvalInFlight.current.add(approval.approvalId);
      setSendError(null);

      try {
        await submitChatToolApproval({
          roomId: currentRoomId,
          approvalId: approval.approvalId,
          approved: approval.approved,
          reason: approval.reason,
        });
        setAwaitingTurn(true);
        restartTurnPolling({ forceForMs: POLL_GRACE_MS });
        await loadMessages(currentRoomId, { silent: true });
      } catch (err) {
        approvalInFlight.current.delete(approval.approvalId);
        setSendError(friendlyError(err, 'Tool approval failed'));
        throw err;
      }
    },
    [loadMessages, restartTurnPolling, setAwaitingTurn],
  );

  const resumeTurn = useCallback(async () => {
    if (!recoverable.turnId) return;
    setSendError(null);
    try {
      await resumeChatTurn(recoverable.turnId);
      setAwaitingTurn(true);
      restartTurnPolling({ forceForMs: POLL_GRACE_MS });
      if (roomIdRef.current) await loadMessages(roomIdRef.current, { silent: true });
    } catch (err) {
      setSendError(friendlyError(err, 'Resume failed'));
    }
  }, [loadMessages, recoverable.turnId, restartTurnPolling, setAwaitingTurn]);

  const retryTurn = useCallback(async () => {
    if (!recoverable.turnId) return;
    setSendError(null);
    try {
      await retryChatTurn(recoverable.turnId);
      setAwaitingTurn(true);
      restartTurnPolling({ forceForMs: POLL_GRACE_MS });
      if (roomIdRef.current) await loadMessages(roomIdRef.current, { silent: true });
    } catch (err) {
      setSendError(friendlyError(err, 'Retry failed'));
    }
  }, [loadMessages, recoverable.turnId, restartTurnPolling, setAwaitingTurn]);

  const refresh = useCallback(async () => {
    let currentApiUrl = apiUrl;
    if (!currentApiUrl) {
      currentApiUrl = await resolveApiUrl();
    }
    if (!roomIdRef.current) {
      await bootstrapRef.current();
      return;
    }
    if (currentApiUrl) {
      await loadMessages(roomIdRef.current);
    }
  }, [apiUrl, loadMessages, resolveApiUrl]);

  const displayMessages = useMemo(() => {
    const visible = visibleCoachMessages(messages);
    const needsTyping =
      awaitingTurnStart ||
      (hasActiveTurn(messages) &&
        !visible.some((m) => m.role === 'assistant' && isActiveTurnStatus(m.metadata?.turnStatus)));

    if (!needsTyping) return visible;

    return [
      ...visible,
      {
        id: `typing-${roomId || 'room'}`,
        role: 'assistant' as const,
        parts: [],
        content: '',
        createdAt: new Date(),
        metadata: { syntheticTyping: true, turnStatus: 'STREAMING' },
      },
    ];
  }, [awaitingTurnStart, messages, roomId]);

  return {
    roomId,
    roomName,
    isReadOnly,
    rooms,
    roomsLoading,
    roomListOpen,
    setRoomListOpen,
    messages,
    displayMessages,
    input,
    setInput,
    pendingAttachments,
    loading:
      (loading || !apiUrl) &&
      !(error || (chatError ? friendlyError(chatError, 'Chat error') : null)),
    sending,
    streaming,
    awaitingReply: streaming,
    isRealtimeConnected,
    usingPollFallback,
    error: error || (chatError ? friendlyError(chatError, 'Chat error') : null),
    sendError,
    sendQuota,
    notice,
    send,
    applyStarter,
    resumeTurn,
    retryTurn,
    recoverableTurnId: recoverable.turnId,
    recoverableStatus: recoverable.status,
    refresh,
    selectRoom,
    createRoom,
    refreshRooms,
    attachFromLibrary,
    attachFromCamera,
    removeAttachment,
    submitToolApproval,
  };
}

export function previewMessageText(message: CoachUIMessage): string {
  return displayMessageText(message);
}
