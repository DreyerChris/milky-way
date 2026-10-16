import type { TagId } from './tags'

export type Side = 'left' | 'right'

export interface Interval {
  readonly side: Side
  readonly start: number
  readonly end: number | null
}

export interface Feed {
  readonly id: string
  readonly intervals: readonly Interval[]
  readonly endedAt: number | null
  readonly pumpedMl: number | null
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
  readonly start: number | null
}

export interface NoteTarget {
  readonly kind: 'feed' | 'entry'
  readonly id: string
}

export type Action =
  | { readonly type: 'start'; readonly now: number; readonly side?: Side }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number }
  | { readonly type: 'select-side'; readonly side: Side; readonly now: number }
  | { readonly type: 'finish'; readonly now: number }
  | { readonly type: 'discard' }
  | { readonly type: 'set-pumped'; readonly id: string; readonly ml: number | null }
  | { readonly type: 'edit-times'; readonly id: string; readonly edit: TimeEdit; readonly now: number }
  | { readonly type: 'delete'; readonly id: string }
  | { readonly type: 'toggle-tag'; readonly target: NoteTarget; readonly tag: TagId }
  | { readonly type: 'set-note'; readonly target: NoteTarget; readonly note: string | null }
  | { readonly type: 'log-entry'; readonly entry: LogEntry }
  | { readonly type: 'set-entry-time'; readonly id: string; readonly at: number }
  | { readonly type: 'delete-entry'; readonly id: string }
  | { readonly type: 'settings'; readonly patch: Partial<Settings> }
  | { readonly type: 'replace'; readonly state: AppState }
