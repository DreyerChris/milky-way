import type { TagId } from './tags'
import type {
  Action,
  AppState,
  Feed,
  Interval,
  LogEntry,
  Milk,
  NoteTarget,
  Part,
  PumpSide,
  Settings,
  Side,
  Span,
  TimedPart,
  TimeEdit,
} from './types'

const HOUR = 3_600_000

export const DAY_INTERVAL_HOURS = 3
export const NIGHT_INTERVAL_HOURS = 5

export const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left')

export const hasBreast = (feed: Feed): boolean => feed.intervals.length > 0

/** Breastfeeds and bottles feed the baby; a pump on its own does not. */
export const isBabyFeed = (feed: Feed): boolean => hasBreast(feed) || feed.bottle !== null

export const partsOf = (feed: Feed): readonly Part[] => [
  ...(hasBreast(feed) ? (['breast'] as const) : []),
  ...(feed.pump ? (['pump'] as const) : []),
  ...(feed.bottle ? (['bottle'] as const) : []),
]

export const timedParts = (feed: Feed): readonly TimedPart[] =>
  partsOf(feed).filter((p): p is TimedPart => p !== 'bottle')

export const openInterval = (feed: Feed): Interval | null => feed.intervals.find((i) => i.end === null) ?? null

export const pumpRunning = (feed: Feed): boolean => feed.pump?.spans.some((s) => s.end === null) ?? false

export const partRunning = (feed: Feed, part: TimedPart): boolean =>
  part === 'breast' ? openInterval(feed) !== null : pumpRunning(feed)

export const runningParts = (feed: Feed): readonly TimedPart[] => timedParts(feed).filter((p) => partRunning(feed, p))

export const lastSide = (feed: Feed): Side | null => feed.intervals.at(-1)?.side ?? null

const allSpans = (feed: Feed): readonly Span[] => [...feed.intervals, ...(feed.pump?.spans ?? [])]

export const feedStart = (feed: Feed): number => {
  const starts = [...allSpans(feed).map((s) => s.start), ...(feed.bottle ? [feed.bottle.at] : [])]
  return starts.length > 0 ? Math.min(...starts) : (feed.endedAt ?? 0)
}

export const isRunning = (feed: Feed): boolean => runningParts(feed).length > 0

const spanMs = (span: Span, now: number): number => (span.end ?? now) - span.start

export const sideMs = (feed: Feed, side: Side, now: number): number =>
  feed.intervals.filter((i) => i.side === side).reduce((sum, i) => sum + spanMs(i, now), 0)

export const breastMs = (feed: Feed, now: number): number => feed.intervals.reduce((sum, i) => sum + spanMs(i, now), 0)

export const pumpMs = (feed: Feed, now: number): number =>
  (feed.pump?.spans ?? []).reduce((sum, s) => sum + spanMs(s, now), 0)

/** Time anything in the session was running. Parts that overlap are counted once. */
export const sessionMs = (feed: Feed, now: number): number => {
  const spans = allSpans(feed)
    .map((s) => [s.start, s.end ?? now] as const)
    .sort((a, b) => a[0] - b[0])
  const merged = spans.reduce<(readonly [number, number])[]>((acc, [start, end]) => {
    const last = acc.at(-1)
    return last && start <= last[1] ? [...acc.slice(0, -1), [last[0], Math.max(last[1], end)]] : [...acc, [start, end]]
  }, [])
  return merged.reduce((sum, [start, end]) => sum + end - start, 0)
}

export const activeFeed = (state: AppState): Feed | null => state.feeds.find((f) => f.endedAt === null) ?? null

export const finishedFeeds = (state: AppState): readonly Feed[] => state.feeds.filter((f) => f.endedAt !== null)

/** The most recent session that fed the baby, which reminders count from. */
export const latestFeed = (state: AppState): Feed | null => state.feeds.find(isBabyFeed) ?? null

export const latestPump = (state: AppState): Feed | null =>
  finishedFeeds(state).find((f) => f.pump !== null) ?? null

export const nextStartSide = (state: AppState): Side => {
  const last = finishedFeeds(state).find(hasBreast)
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

const closeOpen = <T extends Span>(spans: readonly T[], now: number): readonly T[] =>
  spans.map((s) => (s.end === null ? { ...s, end: now } : s))

const stopPart = (feed: Feed, part: TimedPart, now: number): Feed =>
  part === 'breast'
    ? { ...feed, intervals: closeOpen(feed.intervals, now) }
    : feed.pump
      ? { ...feed, pump: { ...feed.pump, spans: closeOpen(feed.pump.spans, now) } }
      : feed

const startPart = (feed: Feed, part: TimedPart, now: number, side?: Side): Feed => {
  if (partRunning(feed, part)) return feed
  if (part === 'pump') {
    const pump = feed.pump ?? { side: newPumpSide(feed), spans: [], ml: null }
    return { ...feed, pump: { ...pump, spans: [...pump.spans, { start: now, end: null }] } }
  }
  const nextSide = side ?? lastSide(feed)
  if (!nextSide) return feed
  return { ...feed, intervals: [...feed.intervals, { side: nextSide, start: now, end: null }] }
}

const stopAll = (feed: Feed, now: number): Feed => timedParts(feed).reduce((f, part) => stopPart(f, part, now), feed)

/** While breastfeeding on one side, pumping usually happens on the other. */
const newPumpSide = (feed: Feed): PumpSide => {
  const side = openInterval(feed)?.side ?? lastSide(feed)
  return side ? otherSide(side) : 'both'
}

const updateActive = (state: AppState, fn: (feed: Feed) => Feed): AppState => ({
  ...state,
  feeds: state.feeds.map((f) => (f.endedAt === null ? fn(f) : f)),
})

const updateFeed = (state: AppState, id: string, fn: (feed: Feed) => Feed): AppState => ({
  ...state,
  feeds: state.feeds.map((f) => (f.id === id ? fn(f) : f)),
})

const newId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const createEntry = (at: number, tags: readonly TagId[], note: string | null): LogEntry => ({
  id: newId(),
  at,
  tags,
  note,
})

const emptyFeed = (): Feed => ({
  id: newId(),
  intervals: [],
  pump: null,
  bottle: null,
  endedAt: null,
  paused: [],
  tags: [],
  note: null,
})

export const createBottleFeed = (at: number, ml: number | null, milk: Milk): Feed => ({
  ...emptyFeed(),
  bottle: { at, ml, milk },
  endedAt: at,
})

const addPart = (feed: Feed, part: Part, now: number, side: Side): Feed => {
  const active = feed.endedAt === null
  switch (part) {
    case 'breast':
      return active && !hasBreast(feed) ? startPart(feed, 'breast', now, side) : feed
    case 'pump':
      if (feed.pump) return feed
      return active ? startPart(feed, 'pump', now) : { ...feed, pump: { side: 'both', spans: [], ml: null } }
    case 'bottle':
      return feed.bottle ? feed : { ...feed, bottle: { at: active ? now : feedStart(feed), ml: null, milk: 'breast' } }
  }
}

const removePart = (feed: Feed, part: Part): Feed => {
  const next: Feed =
    part === 'breast'
      ? { ...feed, intervals: [] }
      : part === 'pump'
        ? { ...feed, pump: null }
        : { ...feed, bottle: null }
  if (partsOf(next).length === 0) return feed
  return { ...next, paused: next.paused.filter((p) => p !== part) }
}

export const applyTimeEdit = (feed: Feed, edit: TimeEdit, now: number): Feed => {
  const first = otherSide(edit.lastSide)
  const firstMs = Math.max(0, edit[first])
  const lastMs = Math.max(0, edit[edit.lastSide])
  const pumpTime = Math.max(0, edit.pump ?? 0)
  const breast = hasBreast(feed)

  if (feed.endedAt === null) {
    const lastStart = now - lastMs
    const intervals: Interval[] = breast
      ? [
          ...(firstMs > 0 ? [{ side: first, start: lastStart - firstMs, end: lastStart }] : []),
          { side: edit.lastSide, start: lastStart, end: openInterval(feed) ? null : now },
        ]
      : []
    const running = pumpRunning(feed)
    const pump =
      feed.pump && edit.pump !== null
        ? { ...feed.pump, spans: pumpTime > 0 || running ? [{ start: now - pumpTime, end: running ? null : now }] : [] }
        : feed.pump
    return { ...feed, intervals, pump }
  }

  const oldStart = feedStart(feed)
  const start = edit.start ?? oldStart
  const middle = start + firstMs
  const intervals: Interval[] = breast
    ? [
        ...(firstMs > 0 ? [{ side: first, start, end: middle }] : []),
        ...(lastMs > 0 || firstMs === 0 ? [{ side: edit.lastSide, start: middle, end: middle + lastMs }] : []),
      ]
    : []
  const pump =
    feed.pump && edit.pump !== null
      ? { ...feed.pump, spans: pumpTime > 0 ? [{ start, end: start + pumpTime }] : [] }
      : feed.pump
  const bottle = feed.bottle && { ...feed.bottle, at: feed.bottle.at + start - oldStart }
  const ends = [
    start,
    ...intervals.map((i) => i.end ?? start),
    ...(pump?.spans ?? []).map((s) => s.end ?? start),
    ...(bottle ? [bottle.at] : []),
  ]
  return { ...feed, intervals, pump, bottle, endedAt: Math.max(...ends) }
}

const sortFeeds = (feeds: readonly Feed[]): readonly Feed[] =>
  [...feeds].sort((a, b) => {
    if (a.endedAt === null) return -1
    if (b.endedAt === null) return 1
    return feedStart(b) - feedStart(a)
  })

const sortEntries = (entries: readonly LogEntry[]): readonly LogEntry[] => [...entries].sort((a, b) => b.at - a.at)

const toggle = (tags: readonly TagId[], tag: TagId): readonly TagId[] =>
  tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]

const updateTarget = (
  state: AppState,
  target: NoteTarget,
  fn: <T extends { readonly tags: readonly TagId[]; readonly note: string | null }>(item: T) => T,
): AppState =>
  target.kind === 'feed'
    ? { ...state, feeds: state.feeds.map((f) => (f.id === target.id ? fn(f) : f)) }
    : { ...state, entries: state.entries.map((e) => (e.id === target.id ? fn(e) : e)) }

export const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'start': {
      if (activeFeed(state)) return state
      const feed = startPart(emptyFeed(), action.part ?? 'breast', action.now, action.side ?? nextStartSide(state))
      return { ...state, feeds: [feed, ...state.feeds] }
    }
    case 'pause':
      return updateActive(state, (f) => ({ ...stopAll(f, action.now), paused: runningParts(f) }))
    case 'resume':
      return updateActive(state, (f) => {
        if (isRunning(f)) return f
        const parts = f.paused.length > 0 ? f.paused : timedParts(f)
        return { ...parts.reduce((acc, part) => startPart(acc, part, action.now), f), paused: [] }
      })
    case 'toggle-part':
      return updateActive(state, (f) =>
        partRunning(f, action.part)
          ? stopPart(f, action.part, action.now)
          : { ...startPart(f, action.part, action.now), paused: f.paused.filter((p) => p !== action.part) },
      )
    case 'select-side':
      return updateActive(state, (f) => {
        if (openInterval(f)?.side === action.side) return f
        return {
          ...f,
          intervals: [...closeOpen(f.intervals, action.now), { side: action.side, start: action.now, end: null }],
          paused: f.paused.filter((p) => p !== 'breast'),
        }
      })
    case 'finish':
      return updateActive(state, (f) => ({ ...stopAll(f, action.now), endedAt: action.now, paused: [] }))
    case 'discard':
      return { ...state, feeds: state.feeds.filter((f) => f.endedAt !== null) }
    case 'add-part':
      return updateFeed(state, action.id, (f) => addPart(f, action.part, action.now, nextStartSide(state)))
    case 'remove-part':
      return updateFeed(state, action.id, (f) => removePart(f, action.part))
    case 'set-pump':
      return updateFeed(state, action.id, (f) => (f.pump ? { ...f, pump: { ...f.pump, ...action.patch } } : f))
    case 'set-bottle':
      return updateFeed(state, action.id, (f) => (f.bottle ? { ...f, bottle: { ...f.bottle, ...action.patch } } : f))
    case 'log-feed':
      return { ...state, feeds: sortFeeds([action.feed, ...state.feeds]) }
    case 'edit-times':
      return {
        ...state,
        feeds: sortFeeds(state.feeds.map((f) => (f.id === action.id ? applyTimeEdit(f, action.edit, action.now) : f))),
      }
    case 'delete':
      return { ...state, feeds: state.feeds.filter((f) => f.id !== action.id) }
    case 'toggle-tag':
      return updateTarget(state, action.target, (item) => ({ ...item, tags: toggle(item.tags, action.tag) }))
    case 'set-note':
      return updateTarget(state, action.target, (item) => ({ ...item, note: action.note }))
    case 'log-entry':
      return { ...state, entries: sortEntries([action.entry, ...state.entries]) }
    case 'set-entry-time':
      return { ...state, entries: sortEntries(state.entries.map((e) => (e.id === action.id ? { ...e, at: action.at } : e))) }
    case 'delete-entry':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'replace':
      return action.state
  }
}
