/**
 * Re-entrancy guard for the store purchase flow.
 *
 * React state alone cannot gate a purchase: between the tap that starts one and
 * the render that disables the CTAs there is at least one commit, and if the
 * flow awaits anything first (the double-billing confirmation alert), that
 * window is as long as the athlete takes to read it. A second tap in that
 * window — the same plan's CTA or another plan's — would fire a second
 * concurrent store purchase and charge twice.
 *
 * The lock is deliberately global rather than per package id: two different
 * plans bought concurrently is the worse outcome, not a lesser one.
 *
 * No React or React Native imports here on purpose — this is a pure module so
 * the race is unit-testable under the node-environment vitest setup.
 */
export type PurchaseLock = {
  /** Take the lock for `packageId`. `false` means a purchase is already in flight. */
  tryAcquire(packageId: string): boolean;
  /** Free the lock. A release when nothing is held is a no-op. */
  release(): void;
  /** The package id currently holding the lock, or `null` when free. */
  heldPackageId(): string | null;
};

export function createPurchaseLock(): PurchaseLock {
  let held: string | null = null;

  return {
    tryAcquire(packageId: string) {
      if (held !== null) return false;
      held = packageId;
      return true;
    },
    release() {
      held = null;
    },
    heldPackageId() {
      return held;
    },
  };
}

/**
 * Run `run` under `lock`, releasing on every exit path — plain return, resolve,
 * reject, and a synchronous throw before the first await alike. Resolves `true`
 * when the body ran and `false` when the lock was already held, in which case
 * `run` is never invoked (so no duplicate analytics or store calls).
 *
 * The acquisition happens synchronously on call, before any await, so two taps
 * landing in the same tick cannot both get through.
 */
export async function withPurchaseLock(
  lock: PurchaseLock,
  packageId: string,
  run: () => Promise<unknown> | unknown,
): Promise<boolean> {
  if (!lock.tryAcquire(packageId)) return false;
  try {
    await run();
    return true;
  } finally {
    lock.release();
  }
}
