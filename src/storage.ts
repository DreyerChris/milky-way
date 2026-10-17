import { NOTE_MAX_LENGTH, isTagId } from './tags'
import type { TagId } from './tags'
import type { AppState, Bottle, Feed, Interval, LogEntry, Pump, Settings, Span, TimedPart } from './types'

export const STORAGE_KEY = 'milkyway:v1'

export const DEFAULT_SETTINGS: Settings = {
  remindersEnabled: false,
  dayStartHour: 7,
  dayEndHour: 22,
}

export const EMPTY_STATE: AppState = { feeds: [], entries: [], settings: DEFAULT_SETTINGS }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isSpan = (v: unknown): v is Span =>
  isRecord(v) && typeof v.start === 'number' && (v.end === null || typeof v.end === 'number')

const isInterval = (v: unknown): v is Interval => isSpan(v) && isRecord(v) && (v.side === 'left' || v.side === 'right')

const parseMl = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

const parsePump = (v: unknown, legacyMl: unknown): Pump | null => {
  if (isRecord(v) && Array.isArray(v.spans) && v.spans.every(isSpan)) {
    const side = v.side === 'left' || v.side === 'right' ? v.side : 'both'
    return { side, spans: v.spans, ml: parseMl(v.ml) }
  }
  // Feeds saved before pumping was its own part kept only an amount.
  const ml = parseMl(legacyMl)
  return ml === null ? null : { side: 'both', spans: [], ml }
}

const parseBottle = (v: unknown): Bottle | null =>
  isRecord(v) && typeof v.at === 'number'
    ? { at: v.at, ml: parseMl(v.ml), milk: v.milk === 'formula' ? 'formula' : 'breast' }
    : null

const parsePaused = (v: unknown): readonly TimedPart[] =>
  Array.isArray(v) ? v.filter((p): p is TimedPart => p === 'breast' || p === 'pump') : []

const parseTags = (v: unknown): readonly TagId[] => (Array.isArray(v) ? v.filter(isTagId) : [])

const parseNote = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.slice(0, NOTE_MAX_LENGTH) : null

const parseFeed = (v: unknown): Feed | null => {
  if (
    !isRecord(v) ||
    typeof v.id !== 'string' ||
    !Array.isArray(v.intervals) ||
    !v.intervals.every(isInterval) ||
    !(v.endedAt === null || typeof v.endedAt === 'number')
  ) {
    return null
  }
  const pump = parsePump(v.pump, v.pumpedMl)
  const bottle = parseBottle(v.bottle)
  if (v.intervals.length === 0 && pump === null && bottle === null) return null
  return {
    id: v.id,
    intervals: v.intervals,
    pump,
    bottle,
    endedAt: v.endedAt,
    paused: parsePaused(v.paused),
    tags: parseTags(v.tags),
    note: parseNote(v.note),
  }
}

const parseEntry = (v: unknown): LogEntry | null =>
  isRecord(v) && typeof v.id === 'string' && typeof v.at === 'number'
    ? { id: v.id, at: v.at, tags: parseTags(v.tags), note: parseNote(v.note) }
    : null

const present = <T,>(v: T | null): v is T => v !== null

export const parseState = (raw: string | null): AppState => {
  if (!raw) return EMPTY_STATE
  const data: unknown = JSON.parse(raw)
  if (!isRecord(data) || !Array.isArray(data.feeds)) throw new Error('Saved data has an unexpected shape')
  return {
    feeds: data.feeds.map(parseFeed).filter(present),
    entries: Array.isArray(data.entries) ? data.entries.map(parseEntry).filter(present) : [],
    settings: { ...DEFAULT_SETTINGS, ...(isRecord(data.settings) ? (data.settings as Partial<Settings>) : {}) },
  }
}

export type LoadResult = { readonly state: AppState; readonly error: string | null }

export const loadState = (): LoadResult => {
  try {
    return { state: parseState(localStorage.getItem(STORAGE_KEY)), error: null }
  } catch (err) {
    console.error('milky way: failed to load saved feeds', err)
    return { state: EMPTY_STATE, error: 'Could not read your saved feeds on this device.' }
  }
}

export const saveState = (state: AppState): string | null => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return null
  } catch (err) {
    console.error('milky way: failed to save feeds', err)
    return 'Could not save. Your browser storage may be full or blocked.'
  }
}

export const requestPersistentStorage = async (): Promise<void> => {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch (err) {
    console.warn('milky way: persistent storage request failed', err)
  }
}
