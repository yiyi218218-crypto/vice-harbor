// The smallest static server the tools need: game/ at the root, correct MIME types,
// no traversal. serve.ts is the one a human runs; this one is for the rigs.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wasm': 'application/wasm',
};

export function startServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const full = resolve(join(base, normalize(rel).replace(/^[/\\]+/, '')));
    if (full !== base && !full.startsWith(base + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    let stat;
    try {
      stat = statSync(full);
    } catch (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-store',
    });
    createReadStream(full).pipe(res);
  });
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolvePromise({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}
