import type { TagId } from './tags'

export type Side = 'left' | 'right'

export type PumpSide = Side | 'both'

export type Milk = 'breast' | 'formula'

/** The parts a session can be made of. A session can hold any combination of them at once. */
export type Part = 'breast' | 'pump' | 'bottle'

export type TimedPart = Exclude<Part, 'bottle'>

export interface Span {
  readonly start: number
  readonly end: number | null
}

export interface Interval extends Span {
  readonly side: Side
}

export interface Pump {
  readonly side: PumpSide
  /** Empty when only an amount was logged. */
  readonly spans: readonly Span[]
  readonly ml: number | null
}

export interface Bottle {
  readonly at: number
  readonly ml: number | null
  readonly milk: Milk
}

export interface Feed {
  readonly id: string
  /** Breastfeeding time per side. Empty when the session had no breastfeed. */
  readonly intervals: readonly Interval[]
  readonly pump: Pump | null
  readonly bottle: Bottle | null
  readonly endedAt: number | null
  /** Timed parts that the session-wide pause stopped, so resume restarts exactly those. */
  readonly paused: readonly TimedPart[]
  readonly tags: readonly TagId[]
  readonly note: string | null
}

export interface LogEntry {
  readonly id: string
  readonly at: number
  readonly tags: readonly TagId[]
  readonly note: string | null
}

export interface Settings {
  readonly remindersEnabled: boolean
  readonly dayStartHour: number
  readonly dayEndHour: number
}

export interface AppState {
  readonly feeds: readonly Feed[]
  readonly entries: readonly LogEntry[]
  readonly settings: Settings
}

export interface TimeEdit {
  readonly left: number
  readonly right: number
  readonly lastSide: Side
  readonly pump: number | null
  readonly start: number | null
}

export interface NoteTarget {
  readonly kind: 'feed' | 'entry'
  readonly id: string
}

export type Action =
  | { readonly type: 'start'; readonly now: number; readonly part?: TimedPart; readonly side?: Side }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number }
  | { readonly type: 'toggle-part'; readonly part: TimedPart; readonly now: number }
  | { readonly type: 'select-side'; readonly side: Side; readonly now: number }
  | { readonly type: 'finish'; readonly now: number }
  | { readonly type: 'discard' }
  | { readonly type: 'add-part'; readonly id: string; readonly part: Part; readonly now: number }
  | { readonly type: 'remove-part'; readonly id: string; readonly part: Part }
  | { readonly type: 'set-pump'; readonly id: string; readonly patch: Partial<Pick<Pump, 'side' | 'ml'>> }
  | { readonly type: 'set-bottle'; readonly id: string; readonly patch: Partial<Pick<Bottle, 'ml' | 'milk'>> }
  | { readonly type: 'log-feed'; readonly feed: Feed }
  | { readonly type: 'edit-times'; readonly id: string; readonly edit: TimeEdit; readonly now: number }
  | { readonly type: 'delete'; readonly id: string }
  | { readonly type: 'toggle-tag'; readonly target: NoteTarget; readonly tag: TagId }
  | { readonly type: 'set-note'; readonly target: NoteTarget; readonly note: string | null }
  | { readonly type: 'log-entry'; readonly entry: LogEntry }
  | { readonly type: 'set-entry-time'; readonly id: string; readonly at: number }
  | { readonly type: 'delete-entry'; readonly id: string }
  | { readonly type: 'settings'; readonly patch: Partial<Settings> }
  | { readonly type: 'replace'; readonly state: AppState }
