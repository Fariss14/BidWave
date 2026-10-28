import { Buffer } from 'node:buffer';
const MAX_BODY = 21 * 1024 * 1024;
export function nodeHandler(app) {
  return async (req, res) => {
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' }); res.end(JSON.stringify({ error: 'Upload too large. Each image or proof must be up to 5 MB; a request may contain at most 21 MB.' })); return; }
        chunks.push(chunk);
      }
      const host = req.headers.host || 'localhost';
      const request = new Request(`http://${host}${req.url}`, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
      const response = await app.handle(request, { ip: req.socket.remoteAddress || 'unknown' });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'The request could not be processed.' }));
    }
  };
}
