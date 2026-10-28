import { randomUUID } from 'node:crypto';
import { check } from './errors.js';
export function detectMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
export async function readImage(file, label = 'image') {
  check(file && typeof file.arrayBuffer === 'function' && file.size > 0 && file.size <= 5 * 1024 * 1024, `Choose a ${label} in PNG, JPEG, or WebP format, up to 5 MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(bytes);
  check(mime && mime === file.type, `The ${label} must be a PNG, JPEG, or WebP file with a matching file type.`);
  return {
    id: randomUUID(),
    bytes,
    mime
  };
}
export async function putImage(db, owner, kind, image) {
  await db.prepare('INSERT INTO media VALUES (?, ?, ?, ?, ?)').run(image.id, owner, kind, image.bytes, image.mime);
  return image.id;
}
export function imageResponse(row, privateImage = false) {
  return new Response(row.bytes, {
    headers: {
      'Content-Type': row.mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': privateImage ? 'private, no-store' : 'public, max-age=31536000, immutable'
    }
  });
}
