// Deterministic pseudo-randomness. Every generated thing in Vice Harbor
// derives from a seed so a given ?seed=N reproduces the exact same city and
// the exact same photo composition. No Math.random anywhere in generation.

// Mulberry32: small, fast, good enough distribution for scenery placement.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A friendly wrapper around a raw 0..1 stream.
export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  chance(p) {
    return this.next() < p;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

// Hash a string seed into a 32-bit integer (FNV-1a) so ?seed=abc also works.
export function hashSeed(str) {
  const text = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Parse the seed from the URL: numeric seeds stay numeric, others hash.
export function seedFromLocation(search = globalThis.location?.search || '') {
  const value = new URLSearchParams(search).get('seed');
  if (value == null) return 1337;
  if (/^-?\d+$/.test(value)) return Number(value) >>> 0;
  return hashSeed(value);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angular difference, used by steering and camera follow.
export function angleDelta(to, from) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
