// Package the entry: copy game/ and screenshots/ into the output directory the grader
// reads, then write the dossier with the competition's own library.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const ROOT = resolve(import.meta.dirname ?? '.');
const OUT = resolve(process.env.MAKEFUN_OUTPUT_DIR || join(ROOT, 'out'));
const GAME = join(ROOT, 'game');
const SHOTS = join(ROOT, 'screenshots');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

if (!existsSync(GAME)) fail('no game/ directory');
if (!existsSync(SHOTS)) fail('no screenshots/ directory');

const images = readdirSync(SHOTS).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (images.length < 3) fail(`need 3 or 4 screenshots, found ${images.length}`);
for (const image of images) {
  const size = statSync(join(SHOTS, image)).size;
  if (size > CAPS.screenshots.max_bytes) fail(`${image} is ${size} bytes, over the cap`);
}

await mkdir(OUT, { recursive: true });
for (const dir of ['game', 'screenshots']) {
  const dest = join(OUT, dir);
  await rm(dest, { recursive: true, force: true });
  await cp(join(ROOT, dir), dest, { recursive: true });
}

const dossier = buildDossier(OUT, CAPS);
await writeFile(join(OUT, 'dossier.json'), dossier);

// The entry has to play with the network unplugged: no source may name an origin.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
let sourceLines = 0;
for (const file of walk(join(OUT, 'game'))) {
  if (!/\.(html|js|mjs|css|json)$/i.test(file)) continue;
  // the vendored library is the competition's own copy and is never scanned
  if (/[\\/]vendor[\\/]/i.test(file) || /\.min\.(js|mjs|css)$/i.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (/https?:\/\//i.test(text)) offenders.push(file.slice(OUT.length + 1));
  if (/\.(js|mjs)$/i.test(file)) sourceLines += text.split('\n').length;
}
if (offenders.length) fail(`network reference in ${offenders.join(', ')}`);

let files = 0;
let bytes = 0;
for (const entry of readdirSync(join(OUT, 'game'))) {
  const stat = statSync(join(OUT, 'game', entry));
  files++;
  bytes += stat.isDirectory() ? 0 : stat.size;
}

const hex = createHash('sha256').update(dossier).digest('hex');
console.log(`game/         ${files} top-level entries, ${(bytes / 1024).toFixed(1)} KiB`);
console.log(`source        ${sourceLines} lines of ES modules, no network references`);
console.log(`screenshots   ${images.length} (${images.sort().join(', ')})`);
console.log(`dossier       ${dossier.byteLength} bytes, sha256 ${hex.slice(0, 16)}…`);
console.log(`written to    ${OUT}`);
