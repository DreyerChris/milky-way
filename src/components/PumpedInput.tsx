import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Icon } from './Icon'

interface PumpedInputProps {
  readonly id: string
  readonly value: number | null
  readonly onChange: (ml: number | null) => void
}

const parseMl = (raw: string): number | null => {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : null
}

export function PumpedInput({ id, value, onChange }: PumpedInputProps): JSX.Element {
  const [text, setText] = useState(value === null ? '' : String(value))

  useEffect(() => {
    if (parseMl(text) !== value) setText(value === null ? '' : String(value))
  }, [value])

  const commit = (raw: string): void => {
    setText(raw)
    onChange(parseMl(raw))
  }

  return (
    <div class="pumped">
      <label class="pumped__label" for={id}>
        <Icon name="drop" size={30} />
        <span>
          Pumped milk <span class="muted">(optional)</span>
        </span>
      </label>
      <div class="pumped__field">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={2000}
          step={5}
          placeholder="0"
          value={text}
          onInput={(e) => commit(e.currentTarget.value)}
        />
        <span class="pumped__unit">ml</span>
      </div>
    </div>
  )
}
