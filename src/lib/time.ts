import { useEffect, useState } from 'react'

/** Current time, re-rendering every `intervalMs` so wait chips stay live. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function minutesBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 60_000))
}

/** "Just now", "7 min", "1 h 5 min". */
export function formatWait(min: number): string {
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** A duration for "took X": "<1 min", "3 min". */
export function formatDuration(min: number): string {
  return min < 1 ? '<1 min' : formatWait(min)
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const WAITING_THRESHOLD_MIN = 5
