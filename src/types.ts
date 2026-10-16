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
}

export interface Settings {
  readonly remindersEnabled: boolean
  readonly dayStartHour: number
  readonly dayEndHour: number
}

export interface AppState {
  readonly feeds: readonly Feed[]
  readonly settings: Settings
}

export type Action =
  | { readonly type: 'start'; readonly now: number; readonly side?: Side }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number }
  | { readonly type: 'select-side'; readonly side: Side; readonly now: number }
  | { readonly type: 'finish'; readonly now: number }
  | { readonly type: 'discard' }
  | { readonly type: 'set-pumped'; readonly id: string; readonly ml: number | null }
  | { readonly type: 'delete'; readonly id: string }
  | { readonly type: 'settings'; readonly patch: Partial<Settings> }
  | { readonly type: 'replace'; readonly state: AppState }
