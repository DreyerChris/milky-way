import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { feedStart, hasBreast, lastSide, openInterval, pumpMs, sideMs } from '../feeds'
import { formatTimer, fromLocalInput, sideLabel, toLocalInput } from '../format'
import type { Feed, Side, TimeEdit } from '../types'
import type { IconName } from './Icon'
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

type Track = Side | 'pump'

type Overrides = Partial<Record<Track, number>>

interface StepperProps {
  readonly id: string
  readonly label: string
  readonly icon: IconName
  readonly flip?: boolean
  readonly ms: number
  readonly onMinutes: (minutes: number) => void
}

function MinutesStepper({ id, label, icon, flip = false, ms, onMinutes }: StepperProps): JSX.Element {
  const minutes = Math.floor(ms / MINUTE)
  const name = label.toLowerCase()
  return (
    <div class="stepper">
      <Icon name={icon} size={44} flip={flip} />
      <label class="stepper__label" for={id}>
        {label}
        <span class="muted">{formatTimer(ms)}</span>
      </label>
      <div class="stepper__controls">
        <button type="button" class="stepper__btn" aria-label={`One minute less on the ${name}`} onClick={() => onMinutes(minutes - 1)}>
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_MINUTES}
          value={minutes}
          onInput={(e) => onMinutes(Number(e.currentTarget.value) || 0)}
        />
        <span class="stepper__unit" aria-hidden="true">
          min
        </span>
        <button type="button" class="stepper__btn" aria-label={`One minute more on the ${name}`} onClick={() => onMinutes(minutes + 1)}>
          +
        </button>
      </div>
    </div>
  )
}

export function EditTimesSheet({ feed, now, onSave, onClose }: EditTimesSheetProps): JSX.Element {
  const active = feed.endedAt === null
  const breast = hasBreast(feed)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [ended, setEnded] = useState<Side>(openInterval(feed)?.side ?? lastSide(feed) ?? 'left')
  const [startText, setStartText] = useState(toLocalInput(feedStart(feed)))
  const [startTouched, setStartTouched] = useState(false)

  const measured = (track: Track, at: number): number => (track === 'pump' ? pumpMs(feed, at) : sideMs(feed, track, at))
  const msFor = (track: Track): number => overrides[track] ?? measured(track, now)
  const setMinutes = (track: Track, minutes: number): void =>
    setOverrides({ ...overrides, [track]: Math.min(Math.max(Math.round(minutes), 0), MAX_MINUTES) * MINUTE })

  const start = startTouched ? fromLocalInput(startText) : null
  const startInvalid = startTouched && (start === null || start > now)
  const total = msFor('left') + msFor('right') + (feed.pump ? msFor('pump') : 0)

  const save = (): void => {
    const live = Date.now()
    onSave({
      left: overrides.left ?? measured('left', live),
      right: overrides.right ?? measured('right', live),
      lastSide: ended,
      pump: feed.pump ? (overrides.pump ?? measured('pump', live)) : null,
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
          <button type="button" class="pill-btn" disabled={startInvalid || (!active && breast && total === 0)} onClick={save}>
            Save
          </button>
        </>
      }
    >
      {active && (
        <p class="muted sheet__hint">
          Forgot to start the timer? Set how long each part has really been going. The timer carries on from there.
        </p>
      )}

      {breast &&
        SIDES.map((side) => (
          <MinutesStepper
            key={side}
            id={`edit-${side}`}
            label={sideLabel(side)}
            icon="side"
            flip={side === 'right'}
            ms={msFor(side)}
            onMinutes={(m) => setMinutes(side, m)}
          />
        ))}

      {feed.pump && (
        <MinutesStepper id="edit-pump" label="Pump" icon="pump" ms={msFor('pump')} onMinutes={(m) => setMinutes('pump', m)} />
      )}

      {!active && (
        <>
          {breast && (
            <div class="segmented" role="radiogroup" aria-label="Finished on">
              <span class="segmented__label">Finished on</span>
              {SIDES.map((side) => (
                <button key={side} type="button" role="radio" aria-checked={ended === side} onClick={() => setEnded(side)}>
                  {sideLabel(side)}
                </button>
              ))}
            </div>
          )}
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
