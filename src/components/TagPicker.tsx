import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { TagId } from '../tags'
import { NOTE_MAX_LENGTH, TAGS } from '../tags'

interface TagPickerProps {
  readonly id: string
  readonly tags: readonly TagId[]
  readonly note: string | null
  readonly onToggle: (tag: TagId) => void
  readonly onNote: (note: string | null) => void
  readonly title?: string
}

const cleanNote = (raw: string): string | null => (raw.trim().length > 0 ? raw.slice(0, NOTE_MAX_LENGTH) : null)

export function TagPicker({ id, tags, note, onToggle, onNote, title = 'Notes' }: TagPickerProps): JSX.Element {
  const [text, setText] = useState(note ?? '')

  useEffect(() => {
    if (cleanNote(text) !== note) setText(note ?? '')
  }, [note])

  return (
    <div class="tags" role="group" aria-labelledby={`${id}-title`}>
      <p class="tags__title" id={`${id}-title`}>
        {title}
      </p>
      <div class="tags__chips">
        {TAGS.map((tag) => (
          <button
            key={tag.id}
            type="button"
            class="tag"
            aria-pressed={tags.includes(tag.id)}
            onClick={() => onToggle(tag.id)}
          >
            <span aria-hidden="true">{tag.emoji}</span>
            {tag.label}
          </button>
        ))}
      </div>
      <label class="visually-hidden" for={`${id}-note`}>
        Note
      </label>
      <input
        id={`${id}-note`}
        class="tags__note"
        type="text"
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Add a note…"
        value={text}
        onInput={(e) => {
          setText(e.currentTarget.value)
          onNote(cleanNote(e.currentTarget.value))
        }}
      />
    </div>
  )
}
