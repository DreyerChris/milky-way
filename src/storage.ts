import type { AppState, Feed, Interval, Settings } from './types'

export const STORAGE_KEY = 'milkyway:v1'

export const DEFAULT_SETTINGS: Settings = {
  remindersEnabled: false,
  dayStartHour: 7,
  dayEndHour: 22,
}

export const EMPTY_STATE: AppState = { feeds: [], settings: DEFAULT_SETTINGS }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isInterval = (v: unknown): v is Interval =>
  isRecord(v) &&
  (v.side === 'left' || v.side === 'right') &&
  typeof v.start === 'number' &&
  (v.end === null || typeof v.end === 'number')

const isFeed = (v: unknown): v is Feed =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  Array.isArray(v.intervals) &&
  v.intervals.every(isInterval) &&
  (v.endedAt === null || typeof v.endedAt === 'number') &&
  (v.pumpedMl === null || typeof v.pumpedMl === 'number')

export const parseState = (raw: string | null): AppState => {
  if (!raw) return EMPTY_STATE
  const data: unknown = JSON.parse(raw)
  if (!isRecord(data) || !Array.isArray(data.feeds)) throw new Error('Saved data has an unexpected shape')
  return {
    feeds: data.feeds.filter(isFeed),
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
