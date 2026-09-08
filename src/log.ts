export type LogCategory = 'sim' | 'render' | 'feel' | 'audio' | 'meta' | 'platform' | 'ui'

const CATEGORIES: LogCategory[] = ['sim', 'render', 'feel', 'audio', 'meta', 'platform', 'ui']

interface DebugState {
  enabled: boolean
  categories: Set<LogCategory>
}

function readInitialState(): DebugState {
  let enabled = false
  let categories = new Set(CATEGORIES)
  try {
    const params = new URLSearchParams(location.search)
    const flag = params.get('debug')
    enabled = flag !== null && flag !== '0' && flag !== 'false'
    const only = params.get('logcat')
    if (only) {
      const wanted = only.split(',').map((s) => s.trim()) as LogCategory[]
      categories = new Set(wanted.filter((c) => CATEGORIES.includes(c)))
    }
  } catch {
    // Non-browser context (tests); stay quiet.
  }
  return { enabled, categories }
}

const state: DebugState = readInitialState()

/** Gated before the message is built, so calls cost nothing when disabled. */
export function log(category: LogCategory, build: () => string): void {
  if (!state.enabled || !state.categories.has(category)) return
  // eslint-disable-next-line no-console
  console.log(`[${category}] ${build()}`)
}

export function isDebug(): boolean {
  return state.enabled
}

export function setDebug(enabled: boolean): void {
  state.enabled = enabled
}

/** Frame-time / draw-call readout, only mounted when debugging. */
export class PerfHud {
  private readonly el: HTMLDivElement | null
  private frames = 0
  private acc = 0
  private worst = 0

  constructor() {
    if (!state.enabled) {
      this.el = null
      return
    }
    this.el = document.createElement('div')
    this.el.className = 'perf-hud'
    document.body.appendChild(this.el)
  }

  sample(dtMs: number, extra: () => string): void {
    if (!this.el) return
    this.frames++
    this.acc += dtMs
    this.worst = Math.max(this.worst, dtMs)
    if (this.acc < 500) return
    const avg = this.acc / this.frames
    this.el.textContent = `${avg.toFixed(1)}ms avg  ${this.worst.toFixed(1)}ms peak  ${(1000 / avg).toFixed(0)}fps  ${extra()}`
    this.frames = 0
    this.acc = 0
    this.worst = 0
  }
}
