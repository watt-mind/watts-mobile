import { describe, expect, it, vi } from 'vitest';

import { createKeyedSingleFlight } from '../keyedSingleFlight';

/** A promise plus the handles to settle it from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createKeyedSingleFlight', () => {
  it('shares one promise between concurrent callers on the same key', async () => {
    const run = createKeyedSingleFlight();
    const gate = deferred<string>();
    const factory = vi.fn(() => gate.promise);

    const a = run('k', factory);
    const b = run('k', factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(run.size).toBe(1);

    gate.resolve('value');
    await expect(a).resolves.toBe('value');
    await expect(b).resolves.toBe('value');
  });

  it('runs different keys in parallel', async () => {
    const run = createKeyedSingleFlight();
    const first = deferred<string>();
    const second = deferred<string>();

    const a = run('a', () => first.promise);
    const b = run('b', () => second.promise);

    expect(run.size).toBe(2);

    // Neither call has to wait for the other to settle.
    second.resolve('b-done');
    await expect(b).resolves.toBe('b-done');

    first.resolve('a-done');
    await expect(a).resolves.toBe('a-done');
  });

  it('releases the key after the operation resolves so a later call re-runs', async () => {
    const run = createKeyedSingleFlight();
    const factory = vi.fn(async () => 'ok');

    await expect(run('k', factory)).resolves.toBe('ok');
    await tick();
    expect(run.size).toBe(0);

    await expect(run('k', factory)).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('releases the key after the operation rejects so a later call re-runs', async () => {
    const run = createKeyedSingleFlight();
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    await expect(run('k', factory)).rejects.toThrow('boom');
    await tick();
    expect(run.size).toBe(0);

    await expect(run('k', factory)).resolves.toBe('recovered');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('propagates a rejection to every joined caller', async () => {
    const run = createKeyedSingleFlight();
    const gate = deferred<string>();
    const factory = vi.fn(() => gate.promise);

    const a = run('k', factory);
    const b = run('k', factory);

    gate.reject(new Error('shared failure'));

    await expect(a).rejects.toThrow('shared failure');
    await expect(b).rejects.toThrow('shared failure');
    expect(factory).toHaveBeenCalledTimes(1);
    await tick();
    expect(run.size).toBe(0);
  });

  it('does not hold the key when the factory throws synchronously', async () => {
    const run = createKeyedSingleFlight();

    await expect(
      run('k', () => {
        throw new Error('sync boom');
      }),
    ).rejects.toThrow('sync boom');
    expect(run.size).toBe(0);

    await expect(run('k', async () => 'ok')).resolves.toBe('ok');
  });

  it('keeps separate instances independent', async () => {
    const one = createKeyedSingleFlight();
    const two = createKeyedSingleFlight();
    const gate = deferred<string>();
    const factory = vi.fn(() => gate.promise);

    one('k', factory);
    two('k', factory);

    expect(factory).toHaveBeenCalledTimes(2);
    gate.resolve('done');
  });
});
