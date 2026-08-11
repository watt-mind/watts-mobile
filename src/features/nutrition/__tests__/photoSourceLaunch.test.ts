import { describe, expect, it } from 'vitest';

import { resolvePhotoCaptureSettings, resolvePhotoSourceLaunch } from '../photoSourceLaunch';

describe('resolvePhotoSourceLaunch', () => {
  it('launches the camera directly when the athlete picked "Always open Camera"', () => {
    expect(resolvePhotoSourceLaunch('camera')).toBe('camera');
  });

  it('launches the library directly when the athlete picked "Always open Photo Library"', () => {
    expect(resolvePhotoSourceLaunch('library')).toBe('library');
  });

  it('falls back to the chooser alert for "Ask every time"', () => {
    expect(resolvePhotoSourceLaunch('ask')).toBe('ask');
  });
});

describe('resolvePhotoCaptureSettings', () => {
  const rendered = { sourceMode: 'ask', saveToLibrary: false } as const;

  it('uses the rendered settings when there is no override', () => {
    expect(resolvePhotoCaptureSettings(rendered)).toEqual(rendered);
    expect(resolvePhotoCaptureSettings(rendered, null)).toEqual(rendered);
  });

  it('prefers freshly loaded settings over pre-hydration render values', () => {
    // The quick-action path reads storage after mount; those values must win
    // over the 'ask'/false defaults captured on the first render.
    expect(
      resolvePhotoCaptureSettings(rendered, { sourceMode: 'camera', saveToLibrary: true }),
    ).toEqual({ sourceMode: 'camera', saveToLibrary: true });
  });

  it('fills only the fields the override provides', () => {
    expect(resolvePhotoCaptureSettings(rendered, { saveToLibrary: true })).toEqual({
      sourceMode: 'ask',
      saveToLibrary: true,
    });
  });
});
