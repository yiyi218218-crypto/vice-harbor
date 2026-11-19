// A small seeded random number generator (mulberry32) with the few helpers the city builder needs:
// the same seed always grows the same Vice Harbor, which is what makes a screenshot repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  const random = function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.range = (lo, hi) => lo + (hi - lo) * random();
  random.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * random());
  random.pick = (list) => list[Math.floor(random() * list.length)];
  random.chance = (p) => random() < p;
  random.sign = () => (random() < 0.5 ? -1 : 1);
  return random;
}

/** A cheap value-noise array on `size`, used for the asphalt and the water's ripple. */
export function noiseTable(random, size = 256) {
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i += 1) table[i] = random();
  return table;
}

/** Bilinear sample of a noise table, in 0..1, wrapping at the edges. */
export function sampleNoise(table, size, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const i0 = ((xi % size) + size) % size;
  const j0 = ((yi % size) + size) % size;
  const i1 = (i0 + 1) % size;
  const j1 = (j0 + 1) % size;
  const a = table[j0 * size + i0];
  const b = table[j0 * size + i1];
  const c = table[j1 * size + i0];
  const d = table[j1 * size + i1];
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
