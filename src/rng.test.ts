import { describe, expect, test } from 'bun:test'
import { hashString, mulberry32, pick, pickWeighted, randInt } from './rng'

// These are characterization tests, and deliberately so. Level seeds are
// permanent identifiers: a game generates board N from a string like
// `carjam-level-N`, so any change to hashString or mulberry32 regenerates every
// level as a different board and invalidates the records players already hold.
// The literals below are the current output. They are not free to update - if a
// change breaks them, the change is wrong.

describe('hashString', () => {
  test('is pinned for the seed strings shipped games use', () => {
    expect(hashString('carjam-level-1')).toBe(1968347638)
    expect(hashString('carjam-level-42')).toBe(1997856421)
    expect(hashString('misfit-wall-7')).toBe(3585207378)
  })

  test('returns the FNV offset basis for the empty string', () => {
    expect(hashString('')).toBe(2166136261)
  })

  test('stays inside unsigned 32-bit range', () => {
    for (const text of ['', 'a', 'carjam-level-999', '\u{1f600}', 'x'.repeat(1000)]) {
      const h = hashString(text)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  test('separates strings that differ only in the last character', () => {
    expect(hashString('carjam-level-1')).not.toBe(hashString('carjam-level-2'))
  })
})

describe('mulberry32', () => {
  test('is pinned for a shipped level seed', () => {
    const rng = mulberry32(hashString('carjam-level-1'))
    expect(Array.from({ length: 5 }, rng)).toEqual([
      0.8573411772958934, 0.0643623354844749, 0.9802662876900285, 0.22609529504552484,
      0.8562108071055263,
    ])
  })

  test('is pinned for the low seeds that catch sign and zero handling', () => {
    expect(Array.from({ length: 3 }, mulberry32(0))).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
    ])
    expect(Array.from({ length: 3 }, mulberry32(1))).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ])
  })

  test('two generators on one seed walk the same sequence', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    expect(Array.from({ length: 32 }, a)).toEqual(Array.from({ length: 32 }, b))
  })

  test('stays in [0, 1) across a long run', () => {
    const rng = mulberry32(hashString('carjam-level-7'))
    for (let i = 0; i < 100_000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test('treats a negative seed as its unsigned counterpart', () => {
    expect(Array.from({ length: 3 }, mulberry32(-1))).toEqual(
      Array.from({ length: 3 }, mulberry32(0xffffffff)),
    )
  })
})

describe('randInt', () => {
  test('is pinned', () => {
    const rng = mulberry32(7)
    expect(Array.from({ length: 8 }, () => randInt(rng, 6))).toEqual([0, 0, 5, 4, 3, 2, 2, 1])
  })

  test('never returns the exclusive bound', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 50_000; i++) {
      const v = randInt(rng, 6)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
    }
  })

  test('reaches every bucket rather than favouring one', () => {
    const rng = mulberry32(11)
    const counts = new Array(6).fill(0)
    for (let i = 0; i < 6000; i++) counts[randInt(rng, 6)]++
    expect(counts).toEqual([1027, 993, 993, 994, 962, 1031])
  })
})

describe('pick', () => {
  test('is pinned', () => {
    const rng = mulberry32(9)
    const items = ['a', 'b', 'c', 'd'] as const
    expect(Array.from({ length: 6 }, () => pick(rng, items))).toEqual(['a', 'd', 'a', 'd', 'c', 'c'])
  })

  test('always returns a member of the list', () => {
    const rng = mulberry32(4)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 1000; i++) expect(items).toContain(pick(rng, items))
  })

  test('returns the only element of a single-item list', () => {
    expect(pick(mulberry32(1), ['only'])).toBe('only')
  })
})

describe('pickWeighted', () => {
  const items = [
    { name: 'heavy', weight: 9 },
    { name: 'light', weight: 1 },
  ]
  const weight = (i: { weight: number }) => i.weight

  test('follows the weights, pinned', () => {
    const rng = mulberry32(3)
    let light = 0
    for (let i = 0; i < 1000; i++) {
      if (pickWeighted(rng, items, weight).name === 'light') light++
    }
    expect(light).toBe(85)
  })

  test('never returns a zero-weight item while a weighted one exists', () => {
    const rng = mulberry32(5)
    const withZero = [
      { name: 'never', weight: 0 },
      { name: 'always', weight: 1 },
    ]
    for (let i = 0; i < 1000; i++) {
      expect(pickWeighted(rng, withZero, weight).name).toBe('always')
    }
  })

  // With every weight zero the running total is zero, so the first subtraction
  // already satisfies `roll <= 0` and the first item wins. The trailing return
  // in pickWeighted is not this case - it catches floating-point residue that
  // leaves roll above zero after the whole list has been subtracted.
  test('returns the first item when every weight is zero', () => {
    const allZero = [
      { name: 'a', weight: 0 },
      { name: 'b', weight: 0 },
    ]
    expect(pickWeighted(mulberry32(1), allZero, weight).name).toBe('a')
  })
})
