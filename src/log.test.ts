import { afterEach, describe, expect, test } from 'bun:test'
import { createLogger } from './log'

afterEach(() => {
  delete (globalThis as { location?: unknown }).location
})

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

describe('createLogger', () => {
  test('is off outside a browser, where there is no query string to read', () => {
    const { isDebug } = createLogger(['sim'])
    expect(isDebug()).toBe(false)
  })

  // The whole point of taking a closure rather than a string: a disabled call
  // must not pay for the message it would have printed. Asserting the builder
  // never runs is what pins that, since a cost regression would be invisible in
  // the output.
  test('never builds the message while disabled', () => {
    const { log } = createLogger(['sim'])
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
    const { log, setDebug } = createLogger(['sim', 'render'])
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
    const categories = ['sim', 'render', 'feel', 'audio', 'meta', 'platform', 'ui'] as const
    const { log, setDebug } = createLogger(categories)
    setDebug(true)
    const lines = captureConsole(() => {
      for (const c of categories) log(c, () => 'x')
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
    const { log, isDebug, setDebug } = createLogger(['sim'])
    setDebug(true)
    setDebug(false)
    const lines = captureConsole(() => log('sim', () => 'x'))
    expect(lines).toEqual([])
    expect(isDebug()).toBe(false)
  })

  test('two instances are independent: setDebug on one leaves the other untouched', () => {
    const a = createLogger(['sim'])
    const b = createLogger(['sim'])
    a.setDebug(true)
    expect(a.isDebug()).toBe(true)
    expect(b.isDebug()).toBe(false)
  })

  test('two loggers with different category sets each reject the other\'s category', () => {
    const a = createLogger(['sim'])
    const b = createLogger(['ui'])
    a.setDebug(true)
    b.setDebug(true)
    const aUntyped = a.log as (category: string, build: () => string) => void
    const bUntyped = b.log as (category: string, build: () => string) => void
    const lines = captureConsole(() => {
      a.log('sim', () => 'a-own')
      aUntyped('ui', () => 'a-foreign')
      b.log('ui', () => 'b-own')
      bUntyped('sim', () => 'b-foreign')
    })
    expect(lines).toEqual(['[sim] a-own', '[ui] b-own'])
  })

  test('the `<const C>` generic narrows a plain array literal without `as const`', () => {
    const logger = createLogger(['sim', 'render'])
    type Category = Parameters<typeof logger.log>[0]
    const narrowed: Category = 'sim'
    // @ts-expect-error 'audio' is outside the inferred 'sim' | 'render' union
    const outside: Category = 'audio'
    expect(narrowed).toBe('sim')
    expect(outside as string).toBe('audio')
  })
})

describe('createLogger reading the URL', () => {
  test('enabled when the debug param is present, disabled for "0" and "false"', () => {
    ;(globalThis as { location?: { search: string } }).location = { search: '?debug=1' }
    expect(createLogger(['sim']).isDebug()).toBe(true)
    ;(globalThis as { location?: { search: string } }).location = { search: '?debug=0' }
    expect(createLogger(['sim']).isDebug()).toBe(false)
    ;(globalThis as { location?: { search: string } }).location = { search: '?debug=false' }
    expect(createLogger(['sim']).isDebug()).toBe(false)
  })

  // A bare `?debug=` carries the param with an empty value, which is neither
  // '0' nor 'false' - so it reads as enabled, same as any other non-magic value.
  test('a bare debug param with no value is treated as enabled', () => {
    ;(globalThis as { location?: { search: string } }).location = { search: '?debug=' }
    expect(createLogger(['sim']).isDebug()).toBe(true)
  })

  test('logcat narrows to a trimmed subset and drops unknown names without disabling the rest', () => {
    ;(globalThis as { location?: { search: string } }).location = {
      search: '?debug=1&logcat= sim ,bogus',
    }
    const { log } = createLogger(['sim', 'render'])
    const lines = captureConsole(() => {
      log('sim', () => 'x')
      log('render', () => 'y')
    })
    expect(lines).toEqual(['[sim] x'])
  })

  test('custom debugParam and categoryParam take effect in place of the defaults', () => {
    ;(globalThis as { location?: { search: string } }).location = {
      search: '?dbg=1&cats=render',
    }
    const { log, isDebug } = createLogger(['sim', 'render'], {
      debugParam: 'dbg',
      categoryParam: 'cats',
    })
    expect(isDebug()).toBe(true)
    const lines = captureConsole(() => {
      log('sim', () => 'x')
      log('render', () => 'y')
    })
    expect(lines).toEqual(['[render] y'])
  })

  test('the default debug param is not read once a custom one is configured', () => {
    ;(globalThis as { location?: { search: string } }).location = { search: '?debug=1' }
    const { isDebug } = createLogger(['sim'], { debugParam: 'dbg' })
    expect(isDebug()).toBe(false)
  })
})

describe('createPerfHud', () => {
  // Constructed while debugging is off it holds no element, so sample() must be
  // inert - including the extra() closure, which is as expensive as the message
  // builder above. This is also what lets it be constructed in a headless test
  // at all: the enabled path touches document.
  test('mounts nothing and samples nothing while disabled', () => {
    const { createPerfHud } = createLogger(['sim'])
    const hud = createPerfHud()
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
