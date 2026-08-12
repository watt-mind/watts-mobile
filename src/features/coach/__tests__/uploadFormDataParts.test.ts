import { installFormDataPatch } from 'expo/src/winter/FormData';
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@/src/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const FILE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

// Mirrors the expo-file-system File surface formDataFilePart relies on.
class FakeFile {
  constructor(public uri: string) {}
  async bytes(): Promise<Uint8Array> {
    return FILE_BYTES;
  }
}

vi.mock('expo-file-system', () => ({
  File: FakeFile,
}));

// On-device, expo's winter runtime patches React Native's FormData (which
// stores parts in `_parts`) — recreate that exact global here so append()
// behaves as it does in the app, not as Node's undici FormData.
class RNFormDataBase {
  _parts: [string, unknown][] = [];
  getParts() {
    return this._parts;
  }
}
const originalFormData = globalThis.FormData;
globalThis.FormData = installFormDataPatch(
  RNFormDataBase as unknown as typeof FormData,
) as unknown as typeof FormData;

afterAll(() => {
  globalThis.FormData = originalFormData;
});

describe('coach upload FormData parts', () => {
  let serialized: Uint8Array;

  beforeEach(() => {
    // Serialize inside the fetch mock: on-device expo fetch does this during
    // the request. RN-style {uri} parts made this throw
    // 'Unsupported FormDataPart implementation'.
    apiFetchMock.mockImplementation(async (_url: string, init: { body: FormData }) => {
      serialized = (await convertFormDataAsync(init.body)).body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ transcript: 'hello', url: 'https://x/img.jpg', pathname: 'img.jpg' }),
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('transcribeChatAudio body serializes with filename and forced audio type', async () => {
    const { transcribeChatAudio } = await import('../api');
    await transcribeChatAudio({
      uri: 'file:///tmp/note.m4a',
      mediaType: 'application/octet-stream',
      filename: 'note.m4a',
    });

    const text = new TextDecoder().decode(serialized);
    expect(text).toContain('name="audio"');
    expect(text).toContain('filename="note.m4a"');
    expect(text).toContain('content-type: audio/mp4');
  });

  it('uploadChatImage body serializes with filename, media type and payload bytes', async () => {
    const { uploadChatImage } = await import('../api');
    await uploadChatImage({
      uri: 'file:///tmp/img.jpg',
      mediaType: 'image/jpeg',
      filename: 'img.jpg',
    });

    const text = new TextDecoder().decode(serialized);
    expect(text).toContain('name="file"');
    expect(text).toContain('filename="img.jpg"');
    expect(text).toContain('content-type: image/jpeg');

    const needle = FILE_BYTES;
    let found = false;
    outer: for (let i = 0; i <= serialized.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (serialized[i + j] !== needle[j]) continue outer;
      }
      found = true;
      break;
    }
    expect(found).toBe(true);
  });
});
