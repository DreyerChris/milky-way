import type { Side } from './types'

const pad = (n: number): string => String(n).padStart(2, '0')

export const formatTimer = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export const formatDuration = (ms: number): string => {
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return '<1m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const formatAgo = (ms: number): string => {
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m ago`
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
}

export const formatClock = (time: number): string =>
  new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const startOfDay = (time: number): number => {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const dayKey = (time: number): number => startOfDay(time)

export const formatDay = (dayStart: number, now: number): string => {
  const today = startOfDay(now)
  if (dayStart === today) return 'Today'
  if (today - dayStart <= 26 * 3_600_000 && today - dayStart > 0) return 'Yesterday'
  return new Date(dayStart).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })
}

export const sideLabel = (side: Side): string => (side === 'left' ? 'Left' : 'Right')

export const sideShort = (side: Side): string => (side === 'left' ? 'L' : 'R')

export const hourLabel = (hour: number): string => `${pad(hour)}:00`
