import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { feedStart, lastSide, openInterval, sideMs } from '../feeds'
import { formatTimer, fromLocalInput, sideLabel, toLocalInput } from '../format'
import type { Feed, Side, TimeEdit } from '../types'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

interface EditTimesSheetProps {
  readonly feed: Feed
  readonly now: number
  readonly onSave: (edit: TimeEdit) => void
  readonly onClose: () => void
}

const SIDES: readonly Side[] = ['left', 'right']
const MAX_MINUTES = 180
const MINUTE = 60_000

type Overrides = Partial<Record<Side, number>>

export function EditTimesSheet({ feed, now, onSave, onClose }: EditTimesSheetProps): JSX.Element {
  const active = feed.endedAt === null
  const [overrides, setOverrides] = useState<Overrides>({})
  const [ended, setEnded] = useState<Side>(openInterval(feed)?.side ?? lastSide(feed) ?? 'left')
  const [startText, setStartText] = useState(toLocalInput(feedStart(feed)))
  const [startTouched, setStartTouched] = useState(false)

  const msFor = (side: Side): number => overrides[side] ?? sideMs(feed, side, now)
  const minutesFor = (side: Side): number => Math.floor(msFor(side) / MINUTE)
  const setMinutes = (side: Side, minutes: number): void =>
    setOverrides({ ...overrides, [side]: Math.min(Math.max(Math.round(minutes), 0), MAX_MINUTES) * MINUTE })

  const start = startTouched ? fromLocalInput(startText) : null
  const startInvalid = startTouched && (start === null || start > now)
  const total = msFor('left') + msFor('right')

  const save = (): void => {
    const live = Date.now()
    onSave({
      left: overrides.left ?? sideMs(feed, 'left', live),
      right: overrides.right ?? sideMs(feed, 'right', live),
      lastSide: ended,
      start: active ? null : start,
    })
  }

  return (
    <Sheet
      title={
        <>
          <Icon name="clock" size={36} /> Edit times
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" class="pill-btn pill-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="pill-btn" disabled={startInvalid || (!active && total === 0)} onClick={save}>
            Save
          </button>
        </>
      }
    >
      {active && (
        <p class="muted sheet__hint">
          Forgot to start the timer? Set how long each side has really been going. The timer carries on from there.
        </p>
      )}

      {SIDES.map((side) => (
        <div class="stepper" key={side}>
          <Icon name="side" size={44} flip={side === 'right'} />
          <label class="stepper__label" for={`edit-${side}`}>
            {sideLabel(side)}
            <span class="muted">{formatTimer(msFor(side))}</span>
          </label>
          <div class="stepper__controls">
            <button
              type="button"
              class="stepper__btn"
              aria-label={`One minute less on the ${side}`}
              onClick={() => setMinutes(side, minutesFor(side) - 1)}
            >
              −
            </button>
            <input
              id={`edit-${side}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_MINUTES}
              value={minutesFor(side)}
              onInput={(e) => setMinutes(side, Number(e.currentTarget.value) || 0)}
            />
            <span class="stepper__unit" aria-hidden="true">
              min
            </span>
            <button
              type="button"
              class="stepper__btn"
              aria-label={`One minute more on the ${side}`}
              onClick={() => setMinutes(side, minutesFor(side) + 1)}
            >
              +
            </button>
          </div>
        </div>
      ))}

      {!active && (
        <>
          <div class="segmented" role="radiogroup" aria-label="Finished on">
            <span class="segmented__label">Finished on</span>
            {SIDES.map((side) => (
              <button key={side} type="button" role="radio" aria-checked={ended === side} onClick={() => setEnded(side)}>
                {sideLabel(side)}
              </button>
            ))}
          </div>
          <label class="field">
            <span>Started at</span>
            <input
              type="datetime-local"
              value={startText}
              max={toLocalInput(now)}
              onInput={(e) => {
                setStartText(e.currentTarget.value)
                setStartTouched(true)
              }}
            />
          </label>
          {startInvalid && <p class="note">The start time can't be in the future.</p>}
        </>
      )}
    </Sheet>
  )
}
