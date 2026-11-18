// Solmar Heat — shared palette, constants and small helpers.
// Every colour and number the other modules agree on lives here.
export const PALETTE = {
  skyTop: 0x7ec0ee,
  horizon: 0xffd9a0,
  sun: 0xfff0d0,
  road: 0x3a3f45,
  sidewalk: 0xb8b0a4,
  crosswalk: 0xf5f2ea,
  cream: 0xf2e6c9,
  terracotta: 0xd97b4f,
  teal: 0x4fa8a0,
  coral: 0xe86a6a,
  sand: 0xe8d5a8,
  glass: 0x7fb3d5,
  water: 0x3d8fa8,
  beach: 0xe8d5a8,
  amber: 0xf0a830,
  policeBlue: 0x2b6cb0,
  policeRed: 0xc53030,
  starGold: 0xffd700,
  ink: 0xece7db,
  muted: 0x9aa1a8,
  grass: 0x7fae5a,
  trunk: 0x6b4a2f,
  leaf: 0x5d9b4a,
};

export const BUILDING_COLOURS = [
  PALETTE.cream, PALETTE.terracotta, PALETTE.teal,
  PALETTE.coral, PALETTE.sand, PALETTE.glass,
];

export const CITY = {
  extent: 138,
  streets: [-115, -69, -23, 23, 69, 115],
  roadWidth: 12,
  block: 34,
  pitch: 46,
};

export const PRICES = { respray: 200, repair: 100, bustedFine: 150 };

export const MISSION_REWARDS = [300, 500, 700, 900, 1500];

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Deterministic PRNG (mulberry32) so the city and the screenshot frames are
// identical on every load. Normal play may also use it; nothing here needs
// crypto-grade randomness.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function fmtCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
