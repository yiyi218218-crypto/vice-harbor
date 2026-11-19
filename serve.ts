// Vice Harbor — dependency-free static file server for local play/testing.
// Serves the repository root so /game/index.html loads its ES modules and the
// vendored three.js over HTTP with correct MIME types. No network egress.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

function safePath(urlPath: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    decoded = urlPath;
  }
  if (decoded === '/' || decoded === '') decoded = '/game/index.html';
  const full = resolve(join(ROOT, '.' + normalize(decoded)));
  // Refuse anything that escapes the repository root.
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return '';
  return full;
}

const server = createServer((req, res) => {
  const path = safePath(req.url || '/');
  if (!path || !existsSync(path)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const st = statSync(path);
  const target = st.isDirectory() ? join(path, 'index.html') : path;
  if (!existsSync(target)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  if (process.env.NODE_ENV === 'test') {
    // In tests just report the resolved path; keep the server single-purpose.
    res.end(target);
    return;
  }
  createReadStream(target).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Vice Harbor serving ${ROOT}/game at http://localhost:${PORT}\n`);
});
