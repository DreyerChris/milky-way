import type { JSX } from 'preact'
import type { Reminder } from '../feeds'
import { DAY_INTERVAL_HOURS, NIGHT_INTERVAL_HOURS, feedStart, lastSide, totalMs } from '../feeds'
import { otherSide } from '../feeds'
import { formatAgo, formatClock, formatDuration, sideLabel } from '../format'
import type { Feed, Side } from '../types'
import { Icon } from './Icon'

interface LastFeedProps {
  readonly feed: Feed | null
  readonly startSide: Side
  readonly reminder: Reminder | null
  readonly remindersEnabled: boolean
  readonly now: number
  readonly onStart: (side: Side) => void
  readonly onOpenSettings: () => void
}

function ReminderLine({
  reminder,
  enabled,
  now,
  onOpenSettings,
}: {
  readonly reminder: Reminder
  readonly enabled: boolean
  readonly now: number
  readonly onOpenSettings: () => void
}): JSX.Element {
  const overdue = reminder.at <= now
  const hours = reminder.night ? NIGHT_INTERVAL_HOURS : DAY_INTERVAL_HOURS
  return (
    <button type="button" class={`reminder ${overdue ? 'is-overdue' : ''}`} onClick={onOpenSettings}>
      <Icon name={reminder.night ? 'moon' : 'sun'} size={40} />
      <span class="reminder__text">
        <strong>
          {overdue ? `Feed was due at ${formatClock(reminder.at)}` : `Next feed around ${formatClock(reminder.at)}`}
        </strong>
        <span class="muted">
          {reminder.night ? 'Night' : 'Day'} · every {hours}h · {enabled ? 'reminder on' : 'reminders off'}
        </span>
      </span>
    </button>
  )
}

export function LastFeed({
  feed,
  startSide,
  reminder,
  remindersEnabled,
  now,
  onStart,
  onOpenSettings,
}: LastFeedProps): JSX.Element {
  const side = feed ? lastSide(feed) : null

  return (
    <section class="card hero" aria-labelledby="hero-title">
      {feed && side ? (
        <>
          <div class="hero__top">
            <div>
              <p class="eyebrow" id="hero-title">
                Last feed
              </p>
              <p class="ago">{formatAgo(now - feedStart(feed))}</p>
              <p class="sub">
                Started {formatClock(feedStart(feed))} · lasted {formatDuration(totalMs(feed, now))}
              </p>
            </div>
          </div>
          <div class="last-side">
            <Icon name="side" size={72} flip={side === 'right'} />
            <div>
              <p class="eyebrow">Last side</p>
              <p class="last-side__name">{sideLabel(side)}</p>
            </div>
            <span class={`side-badge side-badge--${side}`} aria-hidden="true">
              {side === 'left' ? 'L' : 'R'}
            </span>
          </div>
          {reminder && (
            <ReminderLine reminder={reminder} enabled={remindersEnabled} now={now} onOpenSettings={onOpenSettings} />
          )}
        </>
      ) : (
        <div class="welcome">
          <Icon name="app" size={120} />
          <h2 id="hero-title">Hello, little one</h2>
          <p class="sub">Which side are you starting on? Next time, milky way will suggest the side you finished on.</p>
        </div>
      )}
      {feed ? (
        <>
          <button type="button" class="start-btn" onClick={() => onStart(startSide)}>
            <Icon name="play" size={46} />
            <span>Start on {sideLabel(startSide)}</span>
          </button>
          <button type="button" class="alt-start" onClick={() => onStart(otherSide(startSide))}>
            or start on the {sideLabel(otherSide(startSide)).toLowerCase()}
          </button>
        </>
      ) : (
        <div class="start-pair" role="group" aria-label="Choose a side to start">
          {(['left', 'right'] as const).map((side) => (
            <button key={side} type="button" class={`start-btn start-btn--${side}`} onClick={() => onStart(side)}>
              <Icon name="side" size={46} flip={side === 'right'} />
              <span>{sideLabel(side)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
