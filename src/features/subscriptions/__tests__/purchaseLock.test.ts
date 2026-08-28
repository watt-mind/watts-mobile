import { describe, expect, it, vi } from 'vitest';

import { createPurchaseLock, withPurchaseLock } from '../purchaseLock';

/** A promise plus the handle to settle it, to hold a purchase open mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createPurchaseLock', () => {
  it('grants the first acquisition and refuses the same package while held', () => {
    const lock = createPurchaseLock();

    expect(lock.tryAcquire('pro_monthly')).toBe(true);
    // The pending double-billing alert lives here: the first tap owns the lock.
    expect(lock.tryAcquire('pro_monthly')).toBe(false);
    expect(lock.heldPackageId()).toBe('pro_monthly');
  });

  it('refuses a DIFFERENT package while held — the lock is global, not per package', () => {
    const lock = createPurchaseLock();

    expect(lock.tryAcquire('pro_monthly')).toBe(true);
    // Tapping a second plan's CTA must not start a second concurrent purchase.
    expect(lock.tryAcquire('supporter_annual')).toBe(false);
    expect(lock.tryAcquire('pro_annual')).toBe(false);
    expect(lock.heldPackageId()).toBe('pro_monthly');
  });

  it('grants a fresh acquisition after release', () => {
    const lock = createPurchaseLock();

    lock.tryAcquire('pro_monthly');
    lock.release();

    expect(lock.heldPackageId()).toBeNull();
    expect(lock.tryAcquire('pro_monthly')).toBe(true);
    expect(lock.heldPackageId()).toBe('pro_monthly');
  });

  it('treats a redundant release as a no-op so a stale release cannot unlock a live purchase', () => {
    const lock = createPurchaseLock();

    lock.release();
    expect(lock.heldPackageId()).toBeNull();

    expect(lock.tryAcquire('pro_monthly')).toBe(true);
    lock.release();
    lock.release();
    expect(lock.heldPackageId()).toBeNull();
    expect(lock.tryAcquire('supporter_annual')).toBe(true);
  });

  it('keeps separate lock instances independent', () => {
    const a = createPurchaseLock();
    const b = createPurchaseLock();

    expect(a.tryAcquire('pro_monthly')).toBe(true);
    expect(b.tryAcquire('pro_monthly')).toBe(true);
  });
});

describe('withPurchaseLock', () => {
  it('acquires synchronously, before the first await, so a double tap in one tick cannot re-enter', async () => {
    const lock = createPurchaseLock();
    const alert = deferred<boolean>();
    const run = vi.fn(async () => {
      // Stands in for `await confirmDoubleBilling()` — the body is suspended
      // here while the native alert is on screen.
      await alert.promise;
      return 'charged';
    });

    // No await between the two calls: this is the double tap that lands before
    // React can re-render the CTAs as disabled.
    const first = withPurchaseLock(lock, 'pro_monthly', run);
    const second = withPurchaseLock(lock, 'pro_monthly', run);
    const third = withPurchaseLock(lock, 'supporter_annual', run);

    expect(await second).toBe(false);
    expect(await third).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);

    alert.resolve(true);
    expect(await first).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('releases on the plain-return exit paths (current plan, summary not ready, alert cancelled)', async () => {
    // Every early return inside purchase() looks like this: the body returns
    // without touching the store. None of them may strand the lock.
    for (const exit of ['kind === current', 'summary not ready', 'confirmation cancelled']) {
      const lock = createPurchaseLock();

      await expect(withPurchaseLock(lock, 'pro_monthly', async () => exit)).resolves.toBe(true);

      expect(lock.heldPackageId()).toBeNull();
      expect(lock.tryAcquire('pro_monthly')).toBe(true);
    }
  });

  it('releases after the store call resolves', async () => {
    const lock = createPurchaseLock();

    await withPurchaseLock(lock, 'pro_monthly', async () => 'purchased');

    expect(lock.heldPackageId()).toBeNull();
    expect(lock.tryAcquire('pro_monthly')).toBe(true);
  });

  it('releases when the body rejects, so a failed purchase can be retried', async () => {
    const lock = createPurchaseLock();

    await expect(
      withPurchaseLock(lock, 'pro_monthly', async () => {
        throw new Error('store unreachable');
      }),
    ).rejects.toThrow('store unreachable');

    expect(lock.heldPackageId()).toBeNull();
    expect(lock.tryAcquire('pro_monthly')).toBe(true);
  });

  it('releases when the body throws synchronously', async () => {
    const lock = createPurchaseLock();

    await expect(
      withPurchaseLock(lock, 'pro_monthly', () => {
        throw new Error('threw before the first await');
      }),
    ).rejects.toThrow('threw before the first await');

    expect(lock.heldPackageId()).toBeNull();
    expect(lock.tryAcquire('pro_monthly')).toBe(true);
  });

  it('does not run the body at all when the lock is held — no duplicate side effects', async () => {
    const lock = createPurchaseLock();
    const alert = deferred<boolean>();
    const trackPurchaseStarted = vi.fn();

    const first = withPurchaseLock(lock, 'pro_monthly', async () => {
      await alert.promise;
      trackPurchaseStarted();
    });
    const blocked = withPurchaseLock(lock, 'pro_monthly', async () => {
      trackPurchaseStarted();
    });

    expect(await blocked).toBe(false);
    alert.resolve(true);
    await first;

    // `purchase_started` fires exactly once per accepted purchase.
    expect(trackPurchaseStarted).toHaveBeenCalledTimes(1);
  });

  it('serialises sequential purchases: the next tap works once the previous one finishes', async () => {
    const lock = createPurchaseLock();
    const calls: string[] = [];

    await withPurchaseLock(lock, 'pro_monthly', async () => {
      calls.push('pro_monthly');
    });
    await withPurchaseLock(lock, 'supporter_annual', async () => {
      calls.push('supporter_annual');
    });

    expect(calls).toEqual(['pro_monthly', 'supporter_annual']);
  });
});
