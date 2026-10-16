import type { Action, AppState, Feed, Interval, Settings, Side } from './types'

const HOUR = 3_600_000

export const DAY_INTERVAL_HOURS = 3
export const NIGHT_INTERVAL_HOURS = 5

export const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left')

export const openInterval = (feed: Feed): Interval | null => feed.intervals.find((i) => i.end === null) ?? null

export const lastSide = (feed: Feed): Side | null => feed.intervals.at(-1)?.side ?? null

export const feedStart = (feed: Feed): number => feed.intervals[0]?.start ?? 0

export const isRunning = (feed: Feed): boolean => openInterval(feed) !== null

const intervalMs = (interval: Interval, now: number): number => (interval.end ?? now) - interval.start

export const sideMs = (feed: Feed, side: Side, now: number): number =>
  feed.intervals.filter((i) => i.side === side).reduce((sum, i) => sum + intervalMs(i, now), 0)

export const totalMs = (feed: Feed, now: number): number =>
  feed.intervals.reduce((sum, i) => sum + intervalMs(i, now), 0)

export const activeFeed = (state: AppState): Feed | null => state.feeds.find((f) => f.endedAt === null) ?? null

export const finishedFeeds = (state: AppState): readonly Feed[] => state.feeds.filter((f) => f.endedAt !== null)

export const latestFeed = (state: AppState): Feed | null => state.feeds[0] ?? null

export const nextStartSide = (state: AppState): Side => {
  const last = finishedFeeds(state)[0]
  return (last && lastSide(last)) ?? 'left'
}

export const isDaytime = (time: number, settings: Settings): boolean => {
  const d = new Date(time)
  const hour = d.getHours() + d.getMinutes() / 60
  return hour >= settings.dayStartHour && hour < settings.dayEndHour
}

export interface Reminder {
  readonly at: number
  readonly night: boolean
}

export const nextReminder = (state: AppState): Reminder | null => {
  const last = latestFeed(state)
  if (!last || last.endedAt === null) return null
  const start = feedStart(last)
  const dayDue = start + DAY_INTERVAL_HOURS * HOUR
  return isDaytime(dayDue, state.settings)
    ? { at: dayDue, night: false }
    : { at: start + NIGHT_INTERVAL_HOURS * HOUR, night: true }
}

const closeOpen = (intervals: readonly Interval[], now: number): readonly Interval[] =>
  intervals.map((i) => (i.end === null ? { ...i, end: now } : i))

const updateActive = (state: AppState, fn: (feed: Feed) => Feed): AppState => ({
  ...state,
  feeds: state.feeds.map((f) => (f.endedAt === null ? fn(f) : f)),
})

const newId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'start': {
      if (activeFeed(state)) return state
      const feed: Feed = {
        id: newId(),
        intervals: [{ side: action.side ?? nextStartSide(state), start: action.now, end: null }],
        endedAt: null,
        pumpedMl: null,
      }
      return { ...state, feeds: [feed, ...state.feeds] }
    }
    case 'pause':
      return updateActive(state, (f) => ({ ...f, intervals: closeOpen(f.intervals, action.now) }))
    case 'resume':
      return updateActive(state, (f) => {
        const side = lastSide(f)
        if (isRunning(f) || !side) return f
        return { ...f, intervals: [...f.intervals, { side, start: action.now, end: null }] }
      })
    case 'select-side':
      return updateActive(state, (f) => {
        if (openInterval(f)?.side === action.side) return f
        return { ...f, intervals: [...closeOpen(f.intervals, action.now), { side: action.side, start: action.now, end: null }] }
      })
    case 'finish':
      return updateActive(state, (f) => ({ ...f, intervals: closeOpen(f.intervals, action.now), endedAt: action.now }))
    case 'discard':
      return { ...state, feeds: state.feeds.filter((f) => f.endedAt !== null) }
    case 'set-pumped':
      return { ...state, feeds: state.feeds.map((f) => (f.id === action.id ? { ...f, pumpedMl: action.ml } : f)) }
    case 'delete':
      return { ...state, feeds: state.feeds.filter((f) => f.id !== action.id) }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'replace':
      return action.state
  }
}
