import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { IconName } from './Icon'
import { Icon } from './Icon'

interface AmountInputProps {
  readonly id: string
  readonly label: string
  readonly icon?: IconName
  readonly value: number | null
  readonly onChange: (ml: number | null) => void
}

const parseMl = (raw: string): number | null => {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : null
}

export function AmountInput({ id, label, icon = 'drop', value, onChange }: AmountInputProps): JSX.Element {
  const [text, setText] = useState(value === null ? '' : String(value))

  useEffect(() => {
    if (parseMl(text) !== value) setText(value === null ? '' : String(value))
  }, [value])

  const commit = (raw: string): void => {
    setText(raw)
    onChange(parseMl(raw))
  }

  return (
    <div class="amount">
      <label class="amount__label" for={id}>
        <Icon name={icon} size={30} />
        <span>
          {label} <span class="muted">(optional)</span>
        </span>
      </label>
      <div class="amount__field">
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
        <span class="amount__unit">ml</span>
      </div>
    </div>
  )
}
