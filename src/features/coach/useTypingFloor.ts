import { useLayoutEffect, useRef, useState } from 'react';

import type { CoachUIMessage } from './types';

const FLOOR_MIN_MS = 350;
const FLOOR_SPREAD_MS = 300;

/** Randomized minimum lifetime for the typing bubble, in ms (350–650). */
export function pickTypingFloorMs(random: () => number = Math.random): number {
  return FLOOR_MIN_MS + Math.round(random() * FLOOR_SPREAD_MS);
}

/** The typing bubble is always the synthetic tail entry, never mid-list. */
export function isTypingList(messages: CoachUIMessage[]): boolean {
  return Boolean(messages[messages.length - 1]?.metadata?.syntheticTyping);
}

/**
 * Keep the typing bubble on screen for a short randomized minimum so a fast
 * reply can't flash it for two frames and vanish.
 *
 * `useLayoutEffect` (not `useEffect`) on purpose: it flushes before paint, so
 * the real message never shows for a frame and then snaps back to the dots.
 * Worst case this defers content by `FLOOR_MIN_MS + FLOOR_SPREAD_MS`, and only
 * for replies that beat the floor.
 */
export function useTypingFloor(
  messages: CoachUIMessage[],
  roomKey?: string | null,
): CoachUIMessage[] {
  const typing = isTypingList(messages);
  const [held, setHeld] = useState<CoachUIMessage[] | null>(null);
  const typingSnapshot = useRef(messages);
  const shownAt = useRef<number | null>(null);
  const floorMs = useRef(0);
  const roomKeyRef = useRef(roomKey);

  useLayoutEffect(() => {
    // A room switch invalidates the hold outright: the new room arrives as an
    // empty, non-typing list, which used to re-enter the `remaining > 0` branch
    // below and re-show the PREVIOUS room's messages for up to 650ms.
    if (roomKeyRef.current !== roomKey) {
      roomKeyRef.current = roomKey;
      typingSnapshot.current = messages;
      shownAt.current = null;
      floorMs.current = 0;
      setHeld(null);
      return;
    }

    if (typing) {
      typingSnapshot.current = messages;
      if (shownAt.current === null) {
        shownAt.current = Date.now();
        floorMs.current = pickTypingFloorMs();
      }
      return;
    }

    if (shownAt.current === null) return;

    // Recomputed from the fixed start each pass, so streaming updates during
    // the hold shorten the wait rather than restarting it.
    const remaining = shownAt.current + floorMs.current - Date.now();
    if (remaining <= 0) {
      shownAt.current = null;
      setHeld(null);
      return;
    }

    setHeld(typingSnapshot.current);
    const timer = setTimeout(() => {
      shownAt.current = null;
      setHeld(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [typing, messages, roomKey]);

  // While a turn is live the incoming list already ends in the typing bubble, so
  // a hold left over from the previous turn is simply ignored rather than
  // cleared — that keeps the effect free of a synchronous state reset.
  return typing ? messages : (held ?? messages);
}
