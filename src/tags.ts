export const TAGS = [
  { id: 'wet', label: 'Wet diaper', short: 'Wet', emoji: '💧' },
  { id: 'dirty', label: 'Dirty diaper', short: 'Dirty', emoji: '💩' },
  { id: 'cramps', label: 'Cramps', short: 'Cramps', emoji: '😣' },
  { id: 'spit-up', label: 'Spit-up', short: 'Spit-up', emoji: '🥛' },
  { id: 'hiccups', label: 'Hiccups', short: 'Hiccups', emoji: '🫧' },
  { id: 'fussy', label: 'Fussy', short: 'Fussy', emoji: '😢' },
  { id: 'asleep', label: 'Fell asleep', short: 'Asleep', emoji: '😴' },
  { id: 'burped', label: 'Burped', short: 'Burped', emoji: '🌬️' },
  { id: 'good-latch', label: 'Good latch', short: 'Good latch', emoji: '👌' },
  { id: 'sore', label: 'Sore nipple', short: 'Sore', emoji: '🩹' },
  { id: 'vitamin-d', label: 'Vitamin D', short: 'Vit D', emoji: '💊' },
] as const

export type TagId = (typeof TAGS)[number]['id']

export type Tag = (typeof TAGS)[number]

export const QUICK_TAGS: readonly TagId[] = ['wet', 'dirty', 'cramps']

const TAG_IDS: ReadonlySet<string> = new Set(TAGS.map((t) => t.id))

export const isTagId = (value: unknown): value is TagId => typeof value === 'string' && TAG_IDS.has(value)

export const tagById = (id: TagId): Tag => TAGS.find((t) => t.id === id) ?? TAGS[0]

export const NOTE_MAX_LENGTH = 140
