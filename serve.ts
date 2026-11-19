// A static server for game/, small enough to read in one go. No dependencies, no
// directory listing, no path escaping: the repository is the only thing it serves.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', 'game');
const PORT = Number(process.env.PORT || process.argv[2] || 8080);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function safePath(urlPath: string): string | null {
  let clean = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  if (clean.endsWith('/')) clean += 'index.html';
  const rel = normalize(clean).replace(/^([/\\])+/, '');
  const full = resolve(join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

const server = createServer((req, res) => {
  const file = safePath(req.url || '/');
  if (!file) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(file);
    if (stat.isDirectory()) {
      stat = statSync(join(file, 'index.html'));
    }
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
    'cross-origin-opener-policy': 'same-origin',
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Vice Harbor on http://localhost:${PORT}`);
  console.log(`serving ${ROOT}`);
});
