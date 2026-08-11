import { describe, expect, it, vi } from 'vitest';

import {
  resolveSaveToLibraryFeedback,
  saveMealPhotoToLibrary,
  type MediaLibraryPermissionSnapshot,
  type MediaLibraryPort,
} from '../saveMealPhotoToLibrary';

const GRANTED: MediaLibraryPermissionSnapshot = { granted: true, canAskAgain: true };
const DENIED_CAN_ASK: MediaLibraryPermissionSnapshot = { granted: false, canAskAgain: true };
const DENIED_PERMANENTLY: MediaLibraryPermissionSnapshot = { granted: false, canAskAgain: false };

function makePort(overrides: Partial<MediaLibraryPort> = {}) {
  const port = {
    getPermissions: vi.fn(async () => GRANTED),
    requestPermissions: vi.fn(async () => GRANTED),
    save: vi.fn(async (_uri: string) => {}),
    ...overrides,
  };
  return port satisfies MediaLibraryPort;
}

describe('saveMealPhotoToLibrary', () => {
  it('saves the captured photo when the setting is on and access is already granted', async () => {
    const port = makePort();

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'saved' });
    expect(port.save).toHaveBeenCalledWith('file:///tmp/meal.jpg');
    // Already granted: never re-prompt.
    expect(port.requestPermissions).not.toHaveBeenCalled();
  });

  it('never touches the media library when the athlete has the setting off', async () => {
    const port = makePort();

    const outcome = await saveMealPhotoToLibrary(
      { enabled: false, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'skipped', reason: 'setting-off' });
    expect(port.getPermissions).not.toHaveBeenCalled();
    expect(port.requestPermissions).not.toHaveBeenCalled();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('does not prompt when no photo was captured', async () => {
    const port = makePort();

    expect(await saveMealPhotoToLibrary({ enabled: true, uri: null }, port)).toEqual({
      status: 'skipped',
      reason: 'no-photo',
    });
    expect(await saveMealPhotoToLibrary({ enabled: true, uri: '' }, port)).toEqual({
      status: 'skipped',
      reason: 'no-photo',
    });
    expect(await saveMealPhotoToLibrary({ enabled: true }, port)).toEqual({
      status: 'skipped',
      reason: 'no-photo',
    });
    expect(port.getPermissions).not.toHaveBeenCalled();
  });

  it('skips platforms without a media library instead of throwing', async () => {
    const port = makePort();

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg', supported: false },
      port,
    );

    expect(outcome).toEqual({ status: 'skipped', reason: 'unsupported-platform' });
    expect(port.getPermissions).not.toHaveBeenCalled();
  });

  it('prompts once when permission has not been asked for yet, then saves', async () => {
    const port = makePort({
      getPermissions: vi.fn(async () => DENIED_CAN_ASK),
      requestPermissions: vi.fn(async () => GRANTED),
    });

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'saved' });
    expect(port.requestPermissions).toHaveBeenCalledTimes(1);
    expect(port.save).toHaveBeenCalledTimes(1);
  });

  it('reports a denial after prompting and does not attempt the write', async () => {
    const port = makePort({
      getPermissions: vi.fn(async () => DENIED_CAN_ASK),
      requestPermissions: vi.fn(async () => DENIED_CAN_ASK),
    });

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'denied', canAskAgain: true });
    expect(port.save).not.toHaveBeenCalled();
  });

  it('does not re-prompt when the OS will no longer show the dialog', async () => {
    const port = makePort({
      getPermissions: vi.fn(async () => DENIED_PERMANENTLY),
    });

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'denied', canAskAgain: false });
    expect(port.requestPermissions).not.toHaveBeenCalled();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('surfaces a failing permission check as an error instead of throwing', async () => {
    const port = makePort({
      getPermissions: vi.fn(async () => {
        throw new Error('native module missing');
      }),
    });

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'error', message: 'native module missing' });
    expect(port.save).not.toHaveBeenCalled();
  });

  it('surfaces a failing write as an error instead of throwing', async () => {
    const port = makePort({
      save: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({ status: 'error', message: 'disk full' });
  });

  it('falls back to a readable message when the failure is not an Error', async () => {
    const port = makePort({
      save: vi.fn(async () => {
        throw { code: 'E_NO_PERMISSIONS' };
      }),
    });

    const outcome = await saveMealPhotoToLibrary(
      { enabled: true, uri: 'file:///tmp/meal.jpg' },
      port,
    );

    expect(outcome).toEqual({
      status: 'error',
      message: 'Could not save photo to your library',
    });
  });
});

describe('resolveSaveToLibraryFeedback', () => {
  it('says nothing when the photo saved', () => {
    expect(resolveSaveToLibraryFeedback({ status: 'saved' })).toEqual({
      notice: null,
      disableSetting: false,
    });
  });

  it('says nothing when the save was skipped', () => {
    for (const reason of ['setting-off', 'no-photo', 'unsupported-platform'] as const) {
      expect(resolveSaveToLibraryFeedback({ status: 'skipped', reason })).toEqual({
        notice: null,
        disableSetting: false,
      });
    }
  });

  it('reports a recoverable denial but keeps the setting on', () => {
    const feedback = resolveSaveToLibraryFeedback({ status: 'denied', canAskAgain: true });

    expect(feedback.disableSetting).toBe(false);
    expect(feedback.notice).toMatch(/not saved/i);
  });

  it('turns the setting off when the OS will not prompt again', () => {
    const feedback = resolveSaveToLibraryFeedback({ status: 'denied', canAskAgain: false });

    expect(feedback.disableSetting).toBe(true);
    expect(feedback.notice).toMatch(/turned off/i);
    expect(feedback.notice).toMatch(/settings/i);
  });

  it('reports a write failure without touching the setting', () => {
    const feedback = resolveSaveToLibraryFeedback({ status: 'error', message: 'disk full' });

    expect(feedback.disableSetting).toBe(false);
    expect(feedback.notice).toContain('disk full');
  });
});
