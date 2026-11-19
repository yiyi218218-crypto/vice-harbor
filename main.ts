// Vice Harbor submission program.
// Hands game/ and screenshots/ to the kit's dossier builder and writes the
// result to /output (or MAKEFUN_OUTPUT_DIR when run outside the grader).

import { readdirSync, mkdirSync, existsSync, rmSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Copy one directory tree by hand. A plain recursive walk with copyFileSync is
// predictable and keeps symlinks out of the delivered snapshot.
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

// Start from a clean output directory so a previous run can never leak files.
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Copy the playable game and the maker's screenshots into the output tree.
copyTree(join(here, 'game'), join(out, 'game'));
copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

// The caps mirror the competition's public guardrails: a 160 KiB text budget,
// up to 4 screenshots of 256 KiB each, and roomy game-tree ceilings.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

const dossier = buildDossier(out, caps);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log('Vice Harbor dossier written to ' + out + '/dossier.json (' + dossier.length + ' bytes)');
