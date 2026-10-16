import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { TagId } from '../tags'
import { QUICK_TAGS, tagById } from '../tags'
import { Sheet } from './Sheet'
import { TagPicker } from './TagPicker'

interface QuickLogProps {
  readonly onLog: (tags: readonly TagId[], note: string | null) => void
}

function MoreSheet({ onLog, onClose }: { readonly onLog: QuickLogProps['onLog']; readonly onClose: () => void }): JSX.Element {
  const [tags, setTags] = useState<readonly TagId[]>([])
  const [note, setNote] = useState<string | null>(null)

  return (
    <Sheet
      title="Log something"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="pill-btn pill-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="pill-btn"
            disabled={tags.length === 0 && note === null}
            onClick={() => {
              onLog(tags, note)
              onClose()
            }}
          >
            Log it
          </button>
        </>
      }
    >
      <TagPicker
        id="quick-more"
        title="What happened?"
        tags={tags}
        note={note}
        onToggle={(tag) => setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])}
        onNote={setNote}
      />
    </Sheet>
  )
}

export function QuickLog({ onLog }: QuickLogProps): JSX.Element {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <section class="quick" aria-labelledby="quick-title">
      <h2 id="quick-title" class="section-title section-title--small">
        Quick log
      </h2>
      <div class="quick__row">
        {QUICK_TAGS.map((id) => {
          const tag = tagById(id)
          return (
            <button key={id} type="button" class="quick__btn" onClick={() => onLog([id], null)}>
              <span class="quick__emoji" aria-hidden="true">
                {tag.emoji}
              </span>
              {tag.short}
            </button>
          )
        })}
        <button type="button" class="quick__btn quick__btn--more" onClick={() => setMoreOpen(true)}>
          <span class="quick__emoji" aria-hidden="true">
            ＋
          </span>
          More
        </button>
      </div>
      {moreOpen && <MoreSheet onLog={onLog} onClose={() => setMoreOpen(false)} />}
    </section>
  )
}
