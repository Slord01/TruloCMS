const crypto = require('node:crypto');

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
function storageError(status, message) { return Object.assign(new Error(message), { status }); }
function imageMetadata(input) {
  const filename = String(input.filename || '').normalize('NFC').replace(/[\/\\\x00-\x1f]/g, '_').slice(0, 200);
  const mime_type = String(input.mime_type || '').toLowerCase();
  const size = Number(input.size);
  if (!filename || !IMAGE_TYPES.has(mime_type)) throw storageError(400, 'Choose a JPEG, PNG, WebP, AVIF or GIF image.');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) throw storageError(413, 'Images must be smaller than 15 MB.');
  return { filename, mime_type, size };
}

function r2Configuration(env = process.env) {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL'];
  if (names.some(name => !env[name])) throw storageError(503, 'Cloudflare R2 storage is not configured.');
  if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID)) throw storageError(503, 'Invalid Cloudflare account ID.');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME) || env.R2_BUCKET_NAME.includes('..')) throw storageError(503, 'Invalid R2 bucket name.');
  const publicUrl = new URL(env.R2_PUBLIC_BASE_URL);
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) throw storageError(503, 'R2 public URL must be a plain HTTPS media URL.');
  return {
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    bucket: env.R2_BUCKET_NAME, publicBaseUrl: publicUrl.href.replace(/\/$/, ''),
  };
}

function createR2Storage({ env = process.env, fetchImpl = fetch } = {}) {
  const config = r2Configuration(env);
  const { AwsClient } = require('aws4fetch');
  const client = new AwsClient({ service: 's3', region: 'auto', ...config.credentials });
  const objectUrl = key => `${config.endpoint}/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  async function send(method, key, options = {}) {
    const signed = await client.sign(objectUrl(key), { method, ...options, signal: AbortSignal.timeout(25000), redirect: 'error' });
    const response = await fetchImpl(signed);
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw storageError(response.status === 404 ? 409 : 503, response.status === 404 ? 'Upload the image before completing it.' : 'Cloudflare media storage unavailable.');
    }
    return response;
  }
  const remove = key => send('DELETE', key);
  return {
    async presign(channelId, id, metadata) {
      // Staging URLs expire quickly. Publication uses a different key, so replaying
      // an upload URL cannot overwrite an image that has already been published.
      const key = `staging/${channelId}/${id}`;
      const signed = await client.sign(`${objectUrl(key)}?X-Amz-Expires=300`, { method: 'PUT', headers: { 'Content-Type': metadata.mime_type }, aws: { signQuery: true, allHeaders: true } });
      const upload_url = signed.url;
      return { key, upload_url, headers: { 'Content-Type': metadata.mime_type }, expires_in: 300 };
    },
    async publish(pending) {
      const object = await send('GET', pending.key);
      const chunks = []; let size = 0;
      try {
        if (Number(object.headers.get('content-length')) > MAX_IMAGE_BYTES) throw storageError(413, 'Uploaded image is too large.');
        for await (const chunk of object.body) {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) throw storageError(413, 'Uploaded image is too large.');
          chunks.push(chunk);
        }
        if (size !== pending.size) throw storageError(400, 'Uploaded image size does not match the selected file.');
      } catch (error) {
        await object.body?.cancel().catch(() => {});
        await remove(pending.key).catch(() => {});
        throw error;
      }
      const sharp = require('sharp');
      let image, dimensions;
      try {
        const source = sharp(Buffer.concat(chunks), { limitInputPixels: 40000000, failOn: 'warning' });
        dimensions = await source.metadata();
        if (!['jpeg', 'png', 'webp', 'avif', 'heif', 'gif'].includes(dimensions.format)) throw new Error('Unsupported image format.');
        // Decode, remove metadata, apply EXIF orientation, and cap dimensions.
        image = await source.rotate().resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      } catch {
        await remove(pending.key).catch(() => {});
        throw storageError(400, 'The uploaded file is not a valid supported image.');
      }
      const key = `media/${pending.sales_channel_id}/${crypto.randomUUID()}.webp`;
      await send('PUT', key, { body: image.data, headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' } });
      await remove(pending.key).catch(() => {}); // Lifecycle rules also remove abandoned staging objects.
      return { object_key: key, url: `${config.publicBaseUrl}/${key}`, mime_type: 'image/webp', size: image.info.size, width: image.info.width, height: image.info.height };
    },
    async delete(key) { if (key) await remove(key); },
  };
}
module.exports = { createR2Storage, r2Configuration, imageMetadata, MAX_IMAGE_BYTES };
