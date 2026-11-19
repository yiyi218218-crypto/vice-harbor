// Seeded pseudo-random numbers. A fixed seed always yields the same city and
// the same traffic, which is what makes the ?shot=...&seed=1 stills reproducible.

export function makeRng(seed) {
  // xmur3-style seed expansion gives a well-mixed 32-bit state from any string.
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = (h ^= h >>> 16) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0; // mulberry32
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function chance(rng, p) {
  return rng() < p;
}
