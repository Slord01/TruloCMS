const crypto = require('node:crypto');
const { createR2Storage, imageMetadata } = require('./r2-storage.cjs');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

function createMediaHandler(db, storageFactory = createR2Storage) {
  let storage;
  const r2 = () => storage ||= storageFactory();
  async function scopedRecord(id, scope, kind) {
    const row = await db.prepare('SELECT * FROM content WHERE id = ? AND kind = ?').get(id, kind);
    if (!row || (scope !== 'all' && row.channel_id !== scope)) fail(404, 'Media not found in this website.');
    return row;
  }
  async function validFolder(id, scope) {
    if (id) await scopedRecord(id, scope, 'media_folder');
  }
  const handler = async ({ route, method, scope, readBody, send }) => {
    if (!route.startsWith('/admin-hub/v1/media')) return false;
    const writable = () => { if (scope === 'all') fail(409, 'Select one website before making changes.'); };
    if (route === '/admin-hub/v1/media/presign' && method === 'POST') {
      writable();
      const body = await readBody(); const metadata = imageMetadata(body);
      await validFolder(body.folder_id, scope);
      const id = crypto.randomUUID();
      const upload = await r2().presign(scope, id, metadata);
      const pending = { ...metadata, id, sales_channel_id: scope, folder_id: body.folder_id || null, key: upload.key, created_at: new Date().toISOString() };
      await db.prepare('INSERT INTO content VALUES (?, ?, ?, ?)').run(id, scope, 'media_upload', JSON.stringify(pending));
      send(201, { id, upload_url: upload.upload_url, headers: upload.headers, expires_in: upload.expires_in }); return true;
    }
    if (route === '/admin-hub/v1/media/complete' && method === 'POST') {
      writable();
      const body = await readBody();
      const finished = await db.prepare('SELECT * FROM content WHERE id = ? AND channel_id = ? AND kind = ?').get(body.id, scope, 'media');
      if (finished) { const media = JSON.parse(finished.data); send(200, { ...media, media }); return true; }
      const row = await scopedRecord(body.id, scope, 'media_upload');
      const pending = JSON.parse(row.data);
      if (Date.now() - Date.parse(pending.created_at) > 15 * 60 * 1000) fail(410, 'Upload expired. Select the file again.');
      // Atomically claim completion, preventing concurrent publication/orphan objects.
      const claimed = await db.prepare('UPDATE content SET kind = ? WHERE id = ? AND channel_id = ? AND kind = ?').run('media_processing', row.id, scope, 'media_upload');
      if (!claimed.changes) fail(409, 'Image completion is already in progress.');
      let published;
      try {
        published = await r2().publish(pending);
        const media = { ...published, id: row.id, filename: pending.filename, original_filename: pending.filename, folder_id: pending.folder_id, sales_channel_id: scope, created_at: pending.created_at, updated_at: new Date().toISOString() };
        const saved = await db.prepare('UPDATE content SET kind = ?, data = ? WHERE id = ? AND channel_id = ? AND kind = ?').run('media', JSON.stringify(media), row.id, scope, 'media_processing');
        if (!saved.changes) fail(409, 'Website or upload was deleted during publication.');
        send(201, { ...media, media }); return true;
      } catch (error) {
        if (published) await r2().delete(published.object_key).catch(() => {});
        await db.prepare('UPDATE content SET kind = ? WHERE id = ? AND kind = ?').run('media_upload', row.id, 'media_processing');
        throw error;
      }
    }
    const folderRoute = route.match(/^\/admin-hub\/v1\/media\/folders(?:\/([^/]+))?$/);
    if (folderRoute) {
      const id = folderRoute[1];
      if (!id && method === 'GET') {
        const rows = scope === 'all' ? await db.prepare('SELECT * FROM content WHERE kind = ?').all('media_folder') : await db.prepare('SELECT * FROM content WHERE kind = ? AND channel_id = ?').all('media_folder', scope);
        send(200, { folders: rows.map(row => JSON.parse(row.data)) }); return true;
      }
      writable();
      if (!id && method === 'POST') {
        const body = await readBody(); const name = String(body.name || '').trim().slice(0, 200);
        if (!name) fail(400, 'Folder name required.');
        const folder = { id: crypto.randomUUID(), name, sales_channel_id: scope, created_at: new Date().toISOString() };
        await db.prepare('INSERT INTO content VALUES (?, ?, ?, ?)').run(folder.id, scope, 'media_folder', JSON.stringify(folder));
        send(201, { ...folder, folder }); return true;
      }
      if (id && method === 'DELETE') {
        await scopedRecord(id, scope, 'media_folder');
        // Keep files; the UI treats their now-missing folder as the library root.
        const rows = await db.prepare('SELECT * FROM content WHERE channel_id = ? AND kind = ?').all(scope, 'media');
        for (const row of rows) {
          const data = JSON.parse(row.data);
          if (data.folder_id === id) { data.folder_id = null; await db.prepare('UPDATE content SET data = ? WHERE id = ? AND channel_id = ?').run(JSON.stringify(data), row.id, scope); }
        }
        await db.prepare('DELETE FROM content WHERE id = ? AND channel_id = ?').run(id, scope);
        send(200, { deleted: true }); return true;
      }
      fail(405, 'Method not allowed.');
    }
    const itemRoute = route.match(/^\/admin-hub\/v1\/media\/([^/]+)$/);
    if (itemRoute && ['PATCH', 'DELETE'].includes(method)) {
      writable();
      const row = await scopedRecord(itemRoute[1], scope, 'media');
      const media = JSON.parse(row.data);
      if (method === 'DELETE') {
        if (media.object_key) await r2().delete(media.object_key);
        await db.prepare('DELETE FROM content WHERE id = ? AND channel_id = ?').run(row.id, scope);
        send(200, { deleted: true }); return true;
      }
      const body = await readBody();
      if (Object.hasOwn(body, 'folder_id')) { await validFolder(body.folder_id, scope); media.folder_id = body.folder_id || null; }
      for (const field of ['alt', 'title', 'filename']) if (typeof body[field] === 'string') media[field] = body[field].slice(0, 500);
      media.updated_at = new Date().toISOString();
      await db.prepare('UPDATE content SET data = ? WHERE id = ? AND channel_id = ?').run(JSON.stringify(media), row.id, scope);
      send(200, { ...media, media }); return true;
    }
    if (route === '/admin-hub/v1/media' && method === 'POST') fail(400, 'Use a signed direct image upload.');
    return false;
  };
  handler.cleanupChannel = async channelId => {
    const rows = await db.prepare('SELECT * FROM content WHERE channel_id = ?').all(channelId);
    for (const row of rows) {
      if (!['media', 'media_upload', 'media_processing'].includes(row.kind)) continue;
      const data = JSON.parse(row.data);
      const key = row.kind === 'media' ? data.object_key : data.key;
      if (key) await r2().delete(key);
    }
  };
  return handler;
}
module.exports = { createMediaHandler };
