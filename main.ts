// Vice Harbor — entry program. Copies the static game and its screenshots
// into the output directory and writes the dossier the scorer expects.
// Runs as-is on Node 22 (erasable TypeScript), no build, no dependencies.

import {
  mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

// The caps below mirror the competition's gate.json. text_max_bytes is the
// only one that shapes bytes; the rest refuse oversized inputs, matching the
// scorer so we fail exactly where it would.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Hand-rolled recursive copy. We copy file by file rather than with cpSync so
// the exact same bytes land in /output on every machine and every run — the
// dossier is byte-compared, so determinism matters more than brevity here.
function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      writeFileSync(to, readFileSync(from));
    }
  }
}

function emptyDir(path: string): void {
  mkdirSync(path, { recursive: true });
  for (const name of readdirSync(path)) {
    rmSync(join(path, name), { recursive: true, force: true });
  }
}

function main(): void {
  mkdirSync(OUTPUT, { recursive: true });
  // Fresh output so stale files from a previous run never enter the dossier.
  emptyDir(OUTPUT);

  copyTree(join(HERE, 'game'), join(OUTPUT, 'game'));
  copyTree(join(HERE, 'screenshots'), join(OUTPUT, 'screenshots'));

  const dossier = buildDossier(OUTPUT, CAPS);
  writeFileSync(join(OUTPUT, 'dossier.json'), dossier);

  // Vice Harbor signature line: a stable marker that this program wrote the
  // dossier, and a quick sanity check of the output directory.
  writeFileSync(join(OUTPUT, 'vice-harbor.txt'), 'Vice Harbor · authored for make.fun gta6-01\n');

  const files = readdirSync(OUTPUT);
  process.stdout.write(`Vice Harbor: wrote ${dossier.byteLength} dossier bytes to ${OUTPUT}\n`);
  process.stdout.write(`output entries: ${files.join(', ')}\n`);
}

main();
