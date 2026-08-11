import { File } from 'expo-file-system';

/**
 * Build a multipart file part that Expo's fetch can serialize.
 *
 * Expo's winter fetch serializes FormData itself and rejects React Native's
 * `{uri, type, name}` parts. It accepts Blob-interface objects: `bytes()`
 * supplies the payload, `name` the filename and `type` the part content-type.
 * Wrapping the File (instead of appending it directly) lets callers force a
 * content type the source file may not report, e.g. recorder output that the
 * OS labels application/octet-stream.
 */
export function formDataFilePart(uri: string, filename: string, type: string): Blob {
  const source = new File(uri);
  return {
    name: filename,
    type,
    bytes: () => source.bytes(),
  } as unknown as Blob;
}
