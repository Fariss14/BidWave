import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createApp } from './app.js';
import { openDatabase } from './database.js';
import { nodeHandler } from './http.js';

const app = createApp({ db: openDatabase(process.env.DATABASE_PATH || 'data/bidwave.sqlite') });
app.start();
const api = nodeHandler(app);
const root = resolve('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  let file = resolve(root, `.${pathname}`);
  if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(pathname)) { res.writeHead(404); res.end('Not found'); return; }
    file = resolve(root, 'index.html');
  }
  if (!existsSync(file)) { res.writeHead(503); res.end('Run npm run build before starting the server.'); return; }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
});
const port = Number(process.env.PORT || 3000);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`BidWave running at http://localhost:${port}`));
function shutdown() { app.stop(); server.close(() => { app.db.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
