import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { feedStart, lastSide, sideMs, totalMs } from '../feeds'
import { dayKey, formatClock, formatDay, formatDuration, sideShort } from '../format'
import type { Action, Feed, Side } from '../types'
import { Icon } from './Icon'
import { PumpedInput } from './PumpedInput'

interface HistoryProps {
  readonly feeds: readonly Feed[]
  readonly now: number
  readonly dispatch: (action: Action) => void
}

interface DayGroup {
  readonly day: number
  readonly feeds: readonly Feed[]
}

const groupByDay = (feeds: readonly Feed[]): readonly DayGroup[] =>
  feeds.reduce<DayGroup[]>((groups, feed) => {
    const day = dayKey(feedStart(feed))
    const last = groups.at(-1)
    return last && last.day === day
      ? [...groups.slice(0, -1), { day, feeds: [...last.feeds, feed] }]
      : [...groups, { day, feeds: [feed] }]
  }, [])

const sidesInOrder = (feed: Feed): readonly Side[] =>
  feed.intervals.reduce<Side[]>((acc, i) => (acc.includes(i.side) ? acc : [...acc, i.side]), [])

function FeedRow({ feed, now, dispatch }: { readonly feed: Feed; readonly now: number; readonly dispatch: (a: Action) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      </button>
      {open && (
        <div class="feed-row__panel" id={panelId}>
          <p class="sub">
            {formatClock(feedStart(feed))}–{feed.endedAt !== null ? formatClock(feed.endedAt) : 'now'} · ended on{' '}
            {ended === 'left' ? 'left' : 'right'}
          </p>
          <PumpedInput
            id={`pumped-${feed.id}`}
            value={feed.pumpedMl}
            onChange={(ml) => dispatch({ type: 'set-pumped', id: feed.id, ml })}
          />
          <div class="discard">
            {confirmDelete ? (
              <>
                <span>Delete this feed?</span>
                <button type="button" class="link link--danger" onClick={() => dispatch({ type: 'delete', id: feed.id })}>
                  Delete
                </button>
                <button type="button" class="link" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" class="link" onClick={() => setConfirmDelete(true)}>
                Delete feed
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export function History({ feeds, now, dispatch }: HistoryProps): JSX.Element {
  if (feeds.length === 0) {
    return (
      <section class="history" aria-labelledby="history-title">
        <h2 id="history-title" class="section-title">
          <Icon name="clock" size={30} /> History
        </h2>
        <p class="empty">Finished feeds will show up here.</p>
      </section>
    )
  }

  return (
    <section class="history" aria-labelledby="history-title">
      <h2 id="history-title" class="section-title">
        <Icon name="clock" size={30} /> History
      </h2>
      {groupByDay(feeds).map((group) => {
        const ml = group.feeds.reduce((sum, f) => sum + (f.pumpedMl ?? 0), 0)
        const time = group.feeds.reduce((sum, f) => sum + totalMs(f, now), 0)
        return (
          <div class="day" key={group.day}>
            <h3 class="day__title">
              <span>{formatDay(group.day, now)}</span>
              <span class="muted">
                {group.feeds.length} {group.feeds.length === 1 ? 'feed' : 'feeds'} · {formatDuration(time)}
                {ml > 0 ? ` · ${ml} ml` : ''}
              </span>
            </h3>
            <ul class="feed-list">
              {group.feeds.map((feed) => (
                <FeedRow key={feed.id} feed={feed} now={now} dispatch={dispatch} />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
