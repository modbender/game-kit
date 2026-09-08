export interface Logger<C extends string> {
  log(category: C, build: () => string): void
  isDebug(): boolean
  setDebug(enabled: boolean): void
  createPerfHud(): PerfHud
}

/** Frame-time / draw-call readout, only mounted when debugging. */
export interface PerfHud {
  sample(dtMs: number, extra: () => string): void
}

export interface LoggerOptions {
  /** URL parameter that enables logging. Default 'debug'. */
  debugParam?: string
  /** URL parameter that narrows to a category list. Default 'logcat'. */
  categoryParam?: string
}

interface DebugState<C extends string> {
  enabled: boolean
  active: Set<C>
}

function readInitialState<C extends string>(
  categories: readonly C[],
  debugParam: string,
  categoryParam: string,
): DebugState<C> {
  let enabled = false
  let active = new Set(categories)
  try {
    const params = new URLSearchParams(location.search)
    const flag = params.get(debugParam)
    enabled = flag !== null && flag !== '0' && flag !== 'false'
    const only = params.get(categoryParam)
    if (only) {
      const known = new Set<string>(categories)
      const wanted = only.split(',').map((s) => s.trim())
      active = new Set(wanted.filter((c) => known.has(c)) as C[])
    }
  } catch {
    // Non-browser context (tests); stay quiet.
  }
  return { enabled, active }
}

export function createLogger<const C extends string>(
  categories: readonly C[],
  options?: LoggerOptions,
): Logger<C> {
  const debugParam = options?.debugParam ?? 'debug'
  const categoryParam = options?.categoryParam ?? 'logcat'
  const state = readInitialState(categories, debugParam, categoryParam)

  /** Gated before the message is built, so calls cost nothing when disabled. */
  function log(category: C, build: () => string): void {
    if (!state.enabled || !state.active.has(category)) return
    console.log(`[${category}] ${build()}`)
  }

  function isDebug(): boolean {
    return state.enabled
  }

  function setDebug(enabled: boolean): void {
    state.enabled = enabled
  }

  /**
   * Liveness is decided here, once. A hud created while disabled stays inert
   * for its own lifetime even if setDebug(true) is called afterwards.
   */
  function createPerfHud(): PerfHud {
    if (!state.enabled) {
      return { sample: () => {} }
    }
    const el = document.createElement('div')
    el.className = 'perf-hud'
    document.body.appendChild(el)
    let frames = 0
    let acc = 0
    let worst = 0
    function sample(dtMs: number, extra: () => string): void {
      frames++
      acc += dtMs
      worst = Math.max(worst, dtMs)
      if (acc < 500) return
      const avg = acc / frames
      el.textContent = `${avg.toFixed(1)}ms avg  ${worst.toFixed(1)}ms peak  ${(1000 / avg).toFixed(0)}fps  ${extra()}`
      frames = 0
      acc = 0
      worst = 0
    }
    return { sample }
  }

  return { log, isDebug, setDebug, createPerfHud }
}
