import { afterEach, describe, expect, test } from 'bun:test'
import { isDebug, log, PerfHud, setDebug } from './log'

function captureConsole(run: () => void): string[] {
  const lines: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '))
  }
  try {
    run()
  } finally {
    console.log = original
  }
  return lines
}

afterEach(() => {
  setDebug(false)
})

describe('log', () => {
  test('is off outside a browser, where there is no query string to read', () => {
    expect(isDebug()).toBe(false)
  })

  // The whole point of taking a closure rather than a string: a disabled call
  // must not pay for the message it would have printed. Asserting the builder
  // never runs is what pins that, since a cost regression would be invisible in
  // the output.
  test('never builds the message while disabled', () => {
    let built = 0
    const lines = captureConsole(() => {
      for (let i = 0; i < 1000; i++) {
        log('sim', () => {
          built++
          return 'expensive'
        })
      }
    })
    expect(built).toBe(0)
    expect(lines).toEqual([])
  })

  test('builds and prints once enabled, tagged with its category', () => {
    setDebug(true)
    let built = 0
    const lines = captureConsole(() => {
      log('render', () => {
        built++
        return 'fleet variety 3'
      })
    })
    expect(built).toBe(1)
    expect(lines).toEqual(['[render] fleet variety 3'])
  })

  test('every category is live by default', () => {
    setDebug(true)
    const lines = captureConsole(() => {
      for (const c of ['sim', 'render', 'feel', 'audio', 'meta', 'platform', 'ui'] as const) {
        log(c, () => 'x')
      }
    })
    expect(lines).toEqual([
      '[sim] x',
      '[render] x',
      '[feel] x',
      '[audio] x',
      '[meta] x',
      '[platform] x',
      '[ui] x',
    ])
  })

  test('goes quiet again when disabled', () => {
    setDebug(true)
    setDebug(false)
    const lines = captureConsole(() => log('sim', () => 'x'))
    expect(lines).toEqual([])
    expect(isDebug()).toBe(false)
  })
})

describe('PerfHud', () => {
  // Constructed while debugging is off it holds no element, so sample() must be
  // inert - including the extra() closure, which is as expensive as the message
  // builder above. This is also what lets it be constructed in a headless test
  // at all: the enabled path touches document.
  test('mounts nothing and samples nothing while disabled', () => {
    const hud = new PerfHud()
    let extras = 0
    for (let i = 0; i < 200; i++) {
      hud.sample(16.7, () => {
        extras++
        return 'draws 42'
      })
    }
    expect(extras).toBe(0)
  })
})
