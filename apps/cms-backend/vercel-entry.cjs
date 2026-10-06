// Lazily initialize inside the runtime, never while Vercel discovers/builds services.
let initialization;
module.exports = async function handler(req, res) {
  try {
    if (!initialization) initialization = require('./server.cjs').createServer();
    const server = await initialization;
    // Await the asynchronous native request listener, rather than resolving the
    // Vercel invocation while PostgreSQL/R2 work is still in progress.
    await server.listeners('request')[0](req, res);
  } catch {
    initialization = undefined; // Allow a later request to recover after a transient connection failure.
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message: 'CMS database unavailable. Check backend database configuration.' }));
  }
};
