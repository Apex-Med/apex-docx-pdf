const LISTENERS = new Set<() => void>()
const TICK_MS = 30_000
let timer: ReturnType<typeof setInterval> | null = null

/** Notify subscribers about once a minute so live "now" badges stay current. */
export function subscribeNowClock(listener: () => void): () => void {
  LISTENERS.add(listener)
  ensureTimer()
  return () => {
    LISTENERS.delete(listener)
    if (LISTENERS.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function ensureTimer(): void {
  if (timer !== null || typeof setInterval !== "function") return
  timer = setInterval(() => {
    for (const listener of LISTENERS) listener()
  }, TICK_MS)
}
