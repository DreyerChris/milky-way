import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { feedStart, lastSide, sideMs, totalMs } from '../feeds'
import { dayKey, formatClock, formatDay, formatDuration, fromLocalInput, sideShort, toLocalInput } from '../format'
import type { TagId } from '../tags'
import { tagById } from '../tags'
import type { Action, Feed, LogEntry, NoteTarget, Side } from '../types'
import { EditTimesSheet } from './EditTimesSheet'
import { Icon } from './Icon'
import { PumpedInput } from './PumpedInput'
import { TagPicker } from './TagPicker'

interface HistoryProps {
  readonly feeds: readonly Feed[]
  readonly entries: readonly LogEntry[]
  readonly now: number
  readonly dispatch: (action: Action) => void
}

type Item = { readonly kind: 'feed'; readonly at: number; readonly feed: Feed } | { readonly kind: 'entry'; readonly at: number; readonly entry: LogEntry }

interface DayGroup {
  readonly day: number
  readonly items: readonly Item[]
}

const toItems = (feeds: readonly Feed[], entries: readonly LogEntry[]): readonly Item[] =>
  [
    ...feeds.map((feed): Item => ({ kind: 'feed', at: feedStart(feed), feed })),
    ...entries.map((entry): Item => ({ kind: 'entry', at: entry.at, entry })),
  ].sort((a, b) => b.at - a.at)

const groupByDay = (items: readonly Item[]): readonly DayGroup[] =>
  items.reduce<DayGroup[]>((groups, item) => {
    const day = dayKey(item.at)
    const last = groups.at(-1)
    return last && last.day === day
      ? [...groups.slice(0, -1), { day, items: [...last.items, item] }]
      : [...groups, { day, items: [item] }]
  }, [])

const sidesInOrder = (feed: Feed): readonly Side[] =>
  feed.intervals.reduce<Side[]>((acc, i) => (acc.includes(i.side) ? acc : [...acc, i.side]), [])

const itemTags = (item: Item): readonly TagId[] => (item.kind === 'feed' ? item.feed.tags : item.entry.tags)

const countTag = (items: readonly Item[], tag: TagId): number => items.filter((i) => itemTags(i).includes(tag)).length

function TagLine({ tags, note }: { readonly tags: readonly TagId[]; readonly note: string | null }): JSX.Element | null {
  if (tags.length === 0 && note === null) return null
  return (
    <span class="row-notes">
      {tags.map((id) => {
        const tag = tagById(id)
        return (
          <span key={id} class="row-notes__tag" title={tag.label}>
            <span aria-hidden="true">{tag.emoji}</span>
            <span class="visually-hidden">{tag.label}</span>
          </span>
        )
      })}
      {note && <span class="row-notes__text">{note}</span>}
    </span>
  )
}

function DeleteControl({ label, onDelete }: { readonly label: string; readonly onDelete: () => void }): JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return (
    <div class="discard">
      {confirm ? (
        <>
          <span>Delete this {label}?</span>
          <button type="button" class="link link--danger" onClick={onDelete}>
            Delete
          </button>
          <button type="button" class="link" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </>
      ) : (
        <button type="button" class="link" onClick={() => setConfirm(true)}>
          Delete {label}
        </button>
      )}
    </div>
  )
}

function NotesEditor({ target, tags, note, dispatch }: { readonly target: NoteTarget; readonly tags: readonly TagId[]; readonly note: string | null; readonly dispatch: (a: Action) => void }): JSX.Element {
  return (
    <TagPicker
      id={`tags-${target.id}`}
      tags={tags}
      note={note}
      onToggle={(tag) => dispatch({ type: 'toggle-tag', target, tag })}
      onNote={(value) => dispatch({ type: 'set-note', target, note: value })}
    />
  )
}

function FeedRow({ feed, now, dispatch }: { readonly feed: Feed; readonly now: number; readonly dispatch: (a: Action) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const ended = lastSide(feed)
  const panelId = `feed-${feed.id}`

  return (
    <li class={`feed-row ${open ? 'is-open' : ''}`}>
      <button type="button" class="feed-row__main" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <span class="feed-row__time">{formatClock(feedStart(feed))}</span>
        <span class="feed-row__sides">
          {sidesInOrder(feed).map((side) => (
            <span key={side} class={`chip chip--${side} ${side === ended ? 'is-ended' : ''}`}>
              <b>{sideShort(side)}</b> {formatDuration(sideMs(feed, side, now))}
            </span>
          ))}
        </span>
        <span class="feed-row__meta">
          {feed.pumpedMl !== null && (
            <span class="feed-row__ml">
              <Icon name="drop" size={20} />
              {feed.pumpedMl} ml
            </span>
          )}
          <span class="feed-row__total">{formatDuration(totalMs(feed, now))}</span>
        </span>
        <TagLine tags={feed.tags} note={feed.note} />
      </button>
      {open && (
        <div class="feed-row__panel" id={panelId}>
          <p class="sub sub--row">
            {formatClock(feedStart(feed))}–{feed.endedAt !== null ? formatClock(feed.endedAt) : 'now'} · ended on{' '}
            {ended === 'left' ? 'left' : 'right'}
            <button type="button" class="link link--inline" onClick={() => setEditing(true)}>
              Edit times
            </button>
          </p>
          <PumpedInput
            id={`pumped-${feed.id}`}
            value={feed.pumpedMl}
            onChange={(ml) => dispatch({ type: 'set-pumped', id: feed.id, ml })}
          />
          <NotesEditor target={{ kind: 'feed', id: feed.id }} tags={feed.tags} note={feed.note} dispatch={dispatch} />
          <DeleteControl label="feed" onDelete={() => dispatch({ type: 'delete', id: feed.id })} />
        </div>
      )}
      {editing && (
        <EditTimesSheet
          feed={feed}
          now={now}
          onClose={() => setEditing(false)}
          onSave={(edit) => {
            dispatch({ type: 'edit-times', id: feed.id, edit, now: Date.now() })
            setEditing(false)
          }}
        />
      )}
    </li>
  )
}

function EntryRow({ entry, now, dispatch }: { readonly entry: LogEntry; readonly now: number; readonly dispatch: (a: Action) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const panelId = `entry-${entry.id}`
  const summary = entry.tags.length > 0 ? entry.tags.map((id) => tagById(id).label).join(', ') : 'Note'

  return (
    <li class={`feed-row entry-row ${open ? 'is-open' : ''}`}>
      <button type="button" class="feed-row__main" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <span class="feed-row__time">{formatClock(entry.at)}</span>
        <span class="entry-row__summary">
          <span aria-hidden="true">{entry.tags.map((id) => tagById(id).emoji).join(' ')}</span> {summary}
        </span>
        <span />
        {entry.note && <span class="row-notes"><span class="row-notes__text">{entry.note}</span></span>}
      </button>
      {open && (
        <div class="feed-row__panel" id={panelId}>
          <label class="field">
            <span>Time</span>
            <input
              type="datetime-local"
              value={toLocalInput(entry.at)}
              max={toLocalInput(now)}
              onChange={(e) => {
                const at = fromLocalInput(e.currentTarget.value)
                if (at !== null && at <= Date.now()) dispatch({ type: 'set-entry-time', id: entry.id, at })
              }}
            />
          </label>
          <NotesEditor target={{ kind: 'entry', id: entry.id }} tags={entry.tags} note={entry.note} dispatch={dispatch} />
          <DeleteControl label="entry" onDelete={() => dispatch({ type: 'delete-entry', id: entry.id })} />
        </div>
      )}
    </li>
  )
}

export function History({ feeds, entries, now, dispatch }: HistoryProps): JSX.Element {
  const groups = groupByDay(toItems(feeds, entries))

  return (
    <section class="history" aria-labelledby="history-title">
      <h2 id="history-title" class="section-title">
        <Icon name="clock" size={30} /> History
      </h2>
      {groups.length === 0 ? (
        <p class="empty">Finished feeds and notes will show up here.</p>
      ) : (
        groups.map((group) => {
          const dayFeeds = group.items.flatMap((i) => (i.kind === 'feed' ? [i.feed] : []))
          const ml = dayFeeds.reduce((sum, f) => sum + (f.pumpedMl ?? 0), 0)
          const time = dayFeeds.reduce((sum, f) => sum + totalMs(f, now), 0)
          const wet = countTag(group.items, 'wet')
          const dirty = countTag(group.items, 'dirty')
          const parts = [
            dayFeeds.length > 0 ? `${dayFeeds.length} ${dayFeeds.length === 1 ? 'feed' : 'feeds'} · ${formatDuration(time)}` : null,
            ml > 0 ? `${ml} ml` : null,
          ].filter((p): p is string => p !== null)
          return (
            <div class="day" key={group.day}>
              <h3 class="day__title">
                <span>{formatDay(group.day, now)}</span>
                <span class="muted">
                  {parts.join(' · ')}
                  {(wet > 0 || dirty > 0) && (
                    <span class="day__diapers" aria-label={`${wet} wet and ${dirty} dirty diapers`}>
                      {' '}
                      · 💧{wet} 💩{dirty}
                    </span>
                  )}
                </span>
              </h3>
              <ul class="feed-list">
                {group.items.map((item) =>
                  item.kind === 'feed' ? (
                    <FeedRow key={item.feed.id} feed={item.feed} now={now} dispatch={dispatch} />
                  ) : (
                    <EntryRow key={item.entry.id} entry={item.entry} now={now} dispatch={dispatch} />
                  ),
                )}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}
