import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { feedStart, lastSide, openInterval, otherSide, sideMs, totalMs } from '../feeds'
import { formatClock, formatTimer, sideLabel } from '../format'
import type { Action, Feed, Side } from '../types'
import { EditTimesSheet } from './EditTimesSheet'
import { Icon } from './Icon'
import { PumpedInput } from './PumpedInput'
import { TagPicker } from './TagPicker'

interface ActiveFeedProps {
  readonly feed: Feed
  readonly now: number
  readonly dispatch: (action: Action) => void
}

const SIDES: readonly Side[] = ['left', 'right']

export function ActiveFeed({ feed, now, dispatch }: ActiveFeedProps): JSX.Element {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [editing, setEditing] = useState(false)
  const running = openInterval(feed)
  const current = running?.side ?? lastSide(feed) ?? 'left'
  const status = running ? `Feeding on the ${sideLabel(current).toLowerCase()}` : 'Paused'

  return (
    <section class={`card active ${running ? 'is-running' : 'is-paused'}`} aria-labelledby="active-title">
      <p class="eyebrow" id="active-title" aria-live="polite">
        {status}
      </p>
      <div class="big-timer" role="timer" aria-label={`Session time ${formatTimer(totalMs(feed, now))}`}>
        {formatTimer(totalMs(feed, now))}
      </div>
      <p class="sub sub--row">
        Started at {formatClock(feedStart(feed))}
        <button type="button" class="link link--inline" onClick={() => setEditing(true)}>
          Edit times
        </button>
      </p>

      <div class="sides" role="group" aria-label="Breast side">
        {SIDES.map((side) => {
          const isCurrent = side === current
          return (
            <button
              key={side}
              type="button"
              class={`side-card ${isCurrent ? 'is-current' : ''} ${isCurrent && running ? 'is-live' : ''}`}
              aria-pressed={isCurrent && running !== null}
              aria-label={`${sideLabel(side)} side, ${formatTimer(sideMs(feed, side, now))}${isCurrent ? '' : '. Tap to switch'}`}
              onClick={() => dispatch({ type: 'select-side', side, now: Date.now() })}
            >
              <Icon name="side" size={60} flip={side === 'right'} />
              <span class="side-card__name">{sideLabel(side)}</span>
              <span class="side-card__time">{formatTimer(sideMs(feed, side, now))}</span>
            </button>
          )
        })}
      </div>

      <div class="controls">
        {running ? (
          <button type="button" class="ctrl" onClick={() => dispatch({ type: 'pause', now: Date.now() })}>
            <Icon name="pause" size={46} />
            <span>Pause</span>
          </button>
        ) : (
          <button type="button" class="ctrl" onClick={() => dispatch({ type: 'resume', now: Date.now() })}>
            <Icon name="play" size={46} />
            <span>Resume</span>
          </button>
        )}
        <button
          type="button"
          class="ctrl"
          onClick={() => dispatch({ type: 'select-side', side: otherSide(current), now: Date.now() })}
        >
          <Icon name="switch" size={46} />
          <span>Switch to {sideLabel(otherSide(current))}</span>
        </button>
        <button type="button" class="ctrl ctrl--primary" onClick={() => dispatch({ type: 'finish', now: Date.now() })}>
          <Icon name="check" size={46} />
          <span>Finish</span>
        </button>
      </div>

      <PumpedInput
        id={`pumped-${feed.id}`}
        value={feed.pumpedMl}
        onChange={(ml) => dispatch({ type: 'set-pumped', id: feed.id, ml })}
      />

      <TagPicker
        id={`tags-${feed.id}`}
        tags={feed.tags}
        note={feed.note}
        onToggle={(tag) => dispatch({ type: 'toggle-tag', target: { kind: 'feed', id: feed.id }, tag })}
        onNote={(note) => dispatch({ type: 'set-note', target: { kind: 'feed', id: feed.id }, note })}
      />

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

      <div class="discard">
        {confirmDiscard ? (
          <>
            <span>Throw this session away?</span>
            <button type="button" class="link link--danger" onClick={() => dispatch({ type: 'discard' })}>
              Discard
            </button>
            <button type="button" class="link" onClick={() => setConfirmDiscard(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" class="link" onClick={() => setConfirmDiscard(true)}>
            Discard session
          </button>
        )}
      </div>
    </section>
  )
}
