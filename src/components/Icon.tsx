import type { JSX } from 'preact'

export type IconName = 'play' | 'pause' | 'check' | 'switch' | 'drop' | 'bell' | 'side' | 'clock' | 'sun' | 'moon' | 'app'

interface IconProps {
  readonly name: IconName
  readonly size?: number
  readonly flip?: boolean
  readonly class?: string
}

export function Icon({ name, size = 40, flip = false, class: className }: IconProps): JSX.Element {
  return (
    <img
      class={['icon', flip ? 'icon--flip' : '', className ?? ''].join(' ').trim()}
      src={`${import.meta.env.BASE_URL}icons/${name}.webp`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
