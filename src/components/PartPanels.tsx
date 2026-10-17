import type { JSX } from 'preact'
import { partRunning, pumpMs } from '../feeds'
import { formatDuration, formatTimer, milkLabel, pumpSideLabel } from '../format'
import type { Action, Feed, Milk, Part, PumpSide, TimedPart } from '../types'
import { AmountInput } from './AmountInput'
import type { IconName } from './Icon'
import { Icon } from './Icon'

export const PART_LABELS: Readonly<Record<Part, string>> = { breast: 'Breastfeed', pump: 'Pump', bottle: 'Bottle' }

export const PART_ICONS: Readonly<Record<Part, IconName>> = { breast: 'side', pump: 'pump', bottle: 'bottle' }

const PUMP_SIDES: readonly PumpSide[] = ['left', 'right', 'both']
const MILKS: readonly Milk[] = ['breast', 'formula']

interface PartHeadProps {
  readonly feed: Feed
  readonly part: Part
  readonly live: boolean
  readonly removable: boolean
  readonly dispatch: (action: Action) => void
  readonly time?: string
}

/** Title row for one part of a session, with its own pause and remove controls. */
export function PartHead({ feed, part, live, removable, dispatch, time }: PartHeadProps): JSX.Element {
  const timed = part !== 'bottle' && live
  const running = timed && partRunning(feed, part as TimedPart)
  return (
    <div class={`part-head ${running ? 'is-live' : ''}`}>
      <Icon name={PART_ICONS[part]} size={36} />
      <span class="part-head__title">{PART_LABELS[part]}</span>
      {time && <span class="part-head__time">{time}</span>}
      {timed && (
        <button
          type="button"
          class="part-head__toggle"
          aria-label={`${running ? 'Pause' : 'Resume'} ${PART_LABELS[part].toLowerCase()}`}
          onClick={() => dispatch({ type: 'toggle-part', part: part as TimedPart, now: Date.now() })}
        >
          <Icon name={running ? 'pause' : 'play'} size={30} />
        </button>
      )}
      {removable && (
        <button
          type="button"
          class="part-head__remove"
          aria-label={`Remove ${PART_LABELS[part].toLowerCase()}`}
          onClick={() => dispatch({ type: 'remove-part', id: feed.id, part })}
        >
          ✕
        </button>
      )}
    </div>
  )
}

function Choice<T extends string>({
  label,
  options,
  value,
  format,
  onChange,
}: {
  readonly label: string
  readonly options: readonly T[]
  readonly value: T
  readonly format: (value: T) => string
  readonly onChange: (value: T) => void
}): JSX.Element {
  return (
    <div class="segmented segmented--compact" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
          {format(option)}
        </button>
      ))}
    </div>
  )
}

interface PanelProps {
  readonly feed: Feed
  readonly now: number
  readonly live: boolean
  readonly removable: boolean
  readonly dispatch: (action: Action) => void
}

export function PumpPanel({ feed, now, live, removable, dispatch }: PanelProps): JSX.Element | null {
  const pump = feed.pump
  if (!pump) return null
  const ms = pumpMs(feed, now)
  const time = live ? formatTimer(ms) : ms > 0 ? formatDuration(ms) : undefined
  return (
    <div class="part">
      <PartHead feed={feed} part="pump" live={live && removable} removable={removable} dispatch={dispatch} time={time} />
      <Choice
        label="Pumped side"
        options={PUMP_SIDES}
        value={pump.side}
        format={pumpSideLabel}
        onChange={(side) => dispatch({ type: 'set-pump', id: feed.id, patch: { side } })}
      />
      <AmountInput
        id={`pump-ml-${feed.id}`}
        label="Pumped"
        value={pump.ml}
        onChange={(ml) => dispatch({ type: 'set-pump', id: feed.id, patch: { ml } })}
      />
    </div>
  )
}

export function BottlePanel({ feed, live, removable, dispatch }: PanelProps): JSX.Element | null {
  const bottle = feed.bottle
  if (!bottle) return null
  return (
    <div class="part">
      <PartHead feed={feed} part="bottle" live={live} removable={removable} dispatch={dispatch} />
      <Choice
        label="Milk"
        options={MILKS}
        value={bottle.milk}
        format={milkLabel}
        onChange={(milk) => dispatch({ type: 'set-bottle', id: feed.id, patch: { milk } })}
      />
      <AmountInput
        id={`bottle-ml-${feed.id}`}
        label="Drank"
        icon="bottle"
        value={bottle.ml}
        onChange={(ml) => dispatch({ type: 'set-bottle', id: feed.id, patch: { ml } })}
      />
    </div>
  )
}

interface AddPartsProps {
  readonly feed: Feed
  readonly parts: readonly Part[]
  readonly dispatch: (action: Action) => void
}

/** Buttons that add the parts a session doesn't have yet, so any combination can happen at once. */
export function AddParts({ feed, parts, dispatch }: AddPartsProps): JSX.Element | null {
  if (parts.length === 0) return null
  return (
    <div class="add-parts" role="group" aria-label="Add to this session">
      {parts.map((part) => (
        <button
          key={part}
          type="button"
          class="add-parts__btn"
          onClick={() => dispatch({ type: 'add-part', id: feed.id, part, now: Date.now() })}
        >
          <Icon name={PART_ICONS[part]} size={34} />
          <span>+ {PART_LABELS[part]}</span>
        </button>
      ))}
    </div>
  )
}
