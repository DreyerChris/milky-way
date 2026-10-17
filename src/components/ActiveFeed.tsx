import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { feedStart, hasBreast, isRunning, lastSide, openInterval, otherSide, partsOf, pumpRunning, sessionMs, sideMs, timedParts } from '../feeds'
import { formatClock, formatTimer, sideLabel } from '../format'
import type { Action, Feed, Part, Side } from '../types'
import { EditTimesSheet } from './EditTimesSheet'
import { Icon } from './Icon'
import { AddParts, BottlePanel, PartHead, PumpPanel } from './PartPanels'
import { TagPicker } from './TagPicker'

interface ActiveFeedProps {
  readonly feed: Feed
  readonly now: number
  readonly dispatch: (action: Action) => void
}

const SIDES: readonly Side[] = ['left', 'right']
const ALL_PARTS: readonly Part[] = ['breast', 'pump', 'bottle']

const statusText = (feed: Feed): string => {
  const running = openInterval(feed)
  const doing = [
    ...(running ? [`Feeding on the ${sideLabel(running.side).toLowerCase()}`] : []),
    ...(pumpRunning(feed) ? ['Pumping'] : []),
  ]
  if (doing.length > 0) return doing.join(' · ')
  return timedParts(feed).length > 0 ? 'Paused' : 'Bottle feed'
}

export function ActiveFeed({ feed, now, dispatch }: ActiveFeedProps): JSX.Element {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [editing, setEditing] = useState(false)
  const running = openInterval(feed)
  const current = running?.side ?? lastSide(feed) ?? 'left'
  const parts = partsOf(feed)
  const several = parts.length > 1
  const breast = hasBreast(feed)
  const timed = timedParts(feed).length > 0
  const anyRunning = isRunning(feed)
  const controls = 1 + (timed ? 1 : 0) + (breast ? 1 : 0)

  return (
    <section class={`card active ${anyRunning ? 'is-running' : 'is-paused'}`} aria-labelledby="active-title">
      <p class="eyebrow" id="active-title" aria-live="polite">
        {statusText(feed)}
      </p>
      <div class="big-timer" role="timer" aria-label={`Session time ${formatTimer(sessionMs(feed, now))}`}>
        {formatTimer(sessionMs(feed, now))}
      </div>
      <p class="sub sub--row">
        Started at {formatClock(feedStart(feed))}
        {timed && (
          <button type="button" class="link link--inline" onClick={() => setEditing(true)}>
            Edit times
          </button>
        )}
      </p>

      {breast && (
        <div class={several ? 'part' : ''}>
          {several && <PartHead feed={feed} part="breast" live removable dispatch={dispatch} />}
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
        </div>
      )}

      <PumpPanel feed={feed} now={now} live removable={several} dispatch={dispatch} />
      <BottlePanel feed={feed} now={now} live removable={several} dispatch={dispatch} />

      <div class="controls" style={{ gridTemplateColumns: `repeat(${controls}, 1fr)` }}>
        {timed &&
          (anyRunning ? (
            <button type="button" class="ctrl" onClick={() => dispatch({ type: 'pause', now: Date.now() })}>
              <Icon name="pause" size={46} />
              <span>{several ? 'Pause all' : 'Pause'}</span>
            </button>
          ) : (
            <button type="button" class="ctrl" onClick={() => dispatch({ type: 'resume', now: Date.now() })}>
              <Icon name="play" size={46} />
              <span>Resume</span>
            </button>
          ))}
        {breast && (
          <button
            type="button"
            class="ctrl"
            onClick={() => dispatch({ type: 'select-side', side: otherSide(current), now: Date.now() })}
          >
            <Icon name="switch" size={46} />
            <span>Switch to {sideLabel(otherSide(current))}</span>
          </button>
        )}
        <button type="button" class="ctrl ctrl--primary" onClick={() => dispatch({ type: 'finish', now: Date.now() })}>
          <Icon name="check" size={46} />
          <span>Finish</span>
        </button>
      </div>

      <AddParts feed={feed} parts={ALL_PARTS.filter((p) => !parts.includes(p))} dispatch={dispatch} />

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
