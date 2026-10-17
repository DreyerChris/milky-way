import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { fromLocalInput, milkLabel, toLocalInput } from '../format'
import type { Milk } from '../types'
import { AmountInput } from './AmountInput'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

interface BottleSheetProps {
  readonly onLog: (at: number, ml: number | null, milk: Milk) => void
  readonly onClose: () => void
}

const MILKS: readonly Milk[] = ['breast', 'formula']

export function BottleSheet({ onLog, onClose }: BottleSheetProps): JSX.Element {
  const [opened] = useState(Date.now)
  const [milk, setMilk] = useState<Milk>('breast')
  const [ml, setMl] = useState<number | null>(null)
  const [timeText, setTimeText] = useState(toLocalInput(opened))
  const at = fromLocalInput(timeText)
  const invalid = at === null || at > Date.now()

  return (
    <Sheet
      title={
        <>
          <Icon name="bottle" size={36} /> Bottle feed
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" class="pill-btn pill-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="pill-btn"
            disabled={invalid}
            onClick={() => {
              if (at === null) return
              onLog(at, ml, milk)
              onClose()
            }}
          >
            Log it
          </button>
        </>
      }
    >
      <div class="segmented" role="radiogroup" aria-label="Milk">
        <span class="segmented__label">Milk</span>
        {MILKS.map((option) => (
          <button key={option} type="button" role="radio" aria-checked={milk === option} onClick={() => setMilk(option)}>
            {milkLabel(option)}
          </button>
        ))}
      </div>
      <AmountInput id="bottle-sheet-ml" label="Drank" icon="bottle" value={ml} onChange={setMl} />
      <label class="field">
        <span>Time</span>
        <input type="datetime-local" value={timeText} max={toLocalInput(Date.now())} onInput={(e) => setTimeText(e.currentTarget.value)} />
      </label>
      {invalid && <p class="note">The time can't be in the future.</p>}
      <p class="muted sheet__hint">To time a breastfeed or pump alongside it, start that first and add the bottle to it.</p>
    </Sheet>
  )
}
