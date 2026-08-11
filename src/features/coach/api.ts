import { apiFetch } from '@/src/api/client';
import { ApiError } from '@/src/api/errors';
import { formDataFilePart } from '@/src/api/formDataFilePart';

import type {
  ChatRoomStateSnapshot,
  ChatRoomSummary,
  StorageUploadResponse,
  StoredChatMessage,
  WebsocketTokenResponse,
} from './types';

export async function fetchChatRooms(): Promise<ChatRoomSummary[]> {
  const response = await apiFetch('/api/chat/rooms');
  if (!response.ok) {
    throw new Error(`Failed to load chat rooms (${response.status})`);
  }
  return (await response.json()) as ChatRoomSummary[];
}

export async function createChatRoom(): Promise<ChatRoomSummary> {
  const response = await apiFetch('/api/chat/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Failed to create chat room (${response.status})`);
  }
  return (await response.json()) as ChatRoomSummary;
}

/** Submit tool approve/deny (web parity — no dedicated approval endpoint). */
export async function submitChatToolApproval(params: {
  roomId: string;
  approvalId: string;
  approved: boolean;
  reason?: string;
}): Promise<void> {
  const response = await apiFetch('/api/chat/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    // The response is an SSE stream covering a whole agent turn, which legitimately
    // outlives the default request deadline — opt out rather than aborting mid-turn.
    timeoutMs: 0,
    body: JSON.stringify({
      roomId: params.roomId,
      messages: [
        {
          id: `approval-${params.approvalId}-${Date.now()}`,
          role: 'tool',
          parts: [
            {
              type: 'tool-approval-response',
              toolCallId: params.approvalId,
              approvalId: params.approvalId,
              approved: params.approved,
              reason:
                params.reason ||
                (params.approved ? 'User confirmed action.' : 'User cancelled action.'),
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    let message = `Tool approval failed (${response.status})`;
    let body: unknown;
    try {
      body = (await response.json()) as { message?: string; statusMessage?: string };
      const parsed = body as { message?: string; statusMessage?: string };
      message = parsed.message || parsed.statusMessage || message;
    } catch {
      // ignore non-JSON error bodies (SSE)
    }
    // ApiError, not Error: the status is what tells the caller whether the
    // server refused the approval (nothing executed) or something else went
    // wrong after the write may already have happened (CW-494a).
    throw new ApiError(message, response.status, body);
  }
  // Drain the SSE body in the background so the connection closes cleanly.
  // Awaiting it would block until the whole approved tool turn finishes, which
  // is exactly the latency the approval UI must not sit behind.
  void Promise.resolve(response.text()).catch(() => {
    // ignore
  });
}

/** Transcribe a voice note for the coach composer (web parity). */
export async function transcribeChatAudio(file: {
  uri: string;
  mediaType: string;
  filename: string;
}): Promise<string> {
  const mediaType =
    file.mediaType && file.mediaType !== 'application/octet-stream' ? file.mediaType : 'audio/mp4';

  const form = new FormData();
  form.append('audio', formDataFilePart(file.uri, file.filename, mediaType));

  // Do not set Content-Type — fetch must add the multipart boundary.
  const response = await apiFetch('/api/chat/transcribe', {
    method: 'POST',
    body: form,
    // Dictation is an optional capability. Older self-hosted instances reject
    // Bearer auth here, which must not invalidate an otherwise valid session.
    softUnauthorized: true,
  });
  if (!response.ok) {
    let message = `Transcription failed (${response.status})`;
    let body: unknown;
    try {
      body = await response.json();
      const parsed = body as { message?: string; statusMessage?: string };
      message = parsed.message || parsed.statusMessage || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status, body);
  }
  const body = (await response.json()) as { transcript?: string };
  const transcript = body?.transcript?.trim();
  if (!transcript) {
    throw new Error('Transcription response missing transcript');
  }
  return transcript;
}

export async function uploadChatImage(file: {
  uri: string;
  mediaType: string;
  filename: string;
}): Promise<StorageUploadResponse> {
  // RN multipart: always send a concrete image/* type — Android pickers often omit mimeType.
  const mediaType =
    file.mediaType && file.mediaType !== 'application/octet-stream' ? file.mediaType : 'image/jpeg';

  const form = new FormData();
  form.append('file', formDataFilePart(file.uri, file.filename, mediaType));

  // Do not set Content-Type — fetch must add the multipart boundary.
  const response = await apiFetch('/api/storage/upload', {
    method: 'POST',
    body: form,
    // Image attachments are an optional capability, same as dictation above. Older
    // self-hosted instances still gate this route on a cookie session and reject Bearer
    // auth — a 401 here must not invalidate an otherwise valid session (CW-460).
    softUnauthorized: true,
  });
  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    let body: unknown;
    try {
      body = await response.json();
      const parsed = body as { message?: string; statusMessage?: string };
      message = parsed.message || parsed.statusMessage || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status, body);
  }
  const body = (await response.json()) as StorageUploadResponse;
  if (!body?.url) {
    throw new Error('Upload response missing url');
  }
  return body;
}

export async function fetchChatMessages(roomId: string): Promise<StoredChatMessage[]> {
  const response = await apiFetch(`/api/chat/messages?roomId=${encodeURIComponent(roomId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load messages (${response.status})`);
  }
  return (await response.json()) as StoredChatMessage[];
}

export async function fetchWebsocketToken(): Promise<string> {
  const response = await apiFetch('/api/websocket-token');
  if (!response.ok) {
    throw new Error(`Failed to mint websocket token (${response.status})`);
  }
  const body = (await response.json()) as WebsocketTokenResponse;
  if (!body?.token) {
    throw new Error('Websocket token missing from response');
  }
  return body.token;
}

export async function fetchRoomState(roomId: string): Promise<ChatRoomStateSnapshot> {
  const response = await apiFetch(`/api/chat/rooms/${encodeURIComponent(roomId)}/state`);
  if (!response.ok) {
    throw new Error(`Failed to load room state (${response.status})`);
  }
  return (await response.json()) as ChatRoomStateSnapshot;
}

export async function resumeChatTurn(turnId: string): Promise<void> {
  const response = await apiFetch(`/api/chat/turns/${encodeURIComponent(turnId)}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    let message = `Resume failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; statusMessage?: string };
      message = body.message || body.statusMessage || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

export async function retryChatTurn(turnId: string): Promise<void> {
  const response = await apiFetch(`/api/chat/turns/${encodeURIComponent(turnId)}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    let message = `Retry failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; statusMessage?: string };
      message = body.message || body.statusMessage || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

export function websocketUrlFromInstance(instanceBaseUrl: string): string {
  const url = new URL(instanceBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/websocket';
  url.search = '';
  url.hash = '';
  return url.toString();
}
