/** Deterministic PRNG so a level index always yields the same level. */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randInt(rng, items.length)]
}

export function pickWeighted<T>(rng: Rng, items: T[], weight: (item: T) => number): T {
  let total = 0
  for (const item of items) total += weight(item)
  let roll = rng() * total
  for (const item of items) {
    roll -= weight(item)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

/** Stable 32-bit hash, used to seed the daily challenge from a date string. */
export function hashString(text: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
