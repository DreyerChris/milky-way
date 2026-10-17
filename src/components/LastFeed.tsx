import type { JSX } from 'preact'
import type { Reminder } from '../feeds'
import { DAY_INTERVAL_HOURS, NIGHT_INTERVAL_HOURS, feedStart, lastSide, otherSide, sessionMs } from '../feeds'
import { formatAgo, formatClock, formatDuration, milkLabel, sideLabel } from '../format'
import type { Feed, Side } from '../types'
import { Icon } from './Icon'

interface LastFeedProps {
  readonly feed: Feed | null
  readonly lastPump: Feed | null
  readonly startSide: Side
  readonly reminder: Reminder | null
  readonly remindersEnabled: boolean
  readonly now: number
  readonly onStart: (side: Side) => void
  readonly onPump: () => void
  readonly onBottle: () => void
  readonly onOpenSettings: () => void
}

function OtherStarts({ onPump, onBottle }: { readonly onPump: () => void; readonly onBottle: () => void }): JSX.Element {
  return (
    <div class="start-more" role="group" aria-label="Pump or bottle">
      <button type="button" class="start-more__btn" onClick={onPump}>
        <Icon name="pump" size={40} />
        <span>Start pumping</span>
      </button>
      <button type="button" class="start-more__btn" onClick={onBottle}>
        <Icon name="bottle" size={40} />
        <span>Log a bottle</span>
      </button>
    </div>
  )
}

function PumpLine({ feed, now }: { readonly feed: Feed; readonly now: number }): JSX.Element {
  const ml = feed.pump?.ml
  return (
    <p class="pump-line">
      <Icon name="pump" size={28} />
      <span>
        Last pumped {formatAgo(now - feedStart(feed))}
        {ml ? ` · ${ml} ml` : ''}
      </span>
    </p>
  )
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
  lastPump,
  startSide,
  reminder,
  remindersEnabled,
  now,
  onStart,
  onPump,
  onBottle,
  onOpenSettings,
}: LastFeedProps): JSX.Element {
  const side = feed ? lastSide(feed) : null
  const bottle = feed?.bottle ?? null
  const lasted = feed ? sessionMs(feed, now) : 0

  return (
    <section class="card hero" aria-labelledby="hero-title">
      {feed ? (
        <>
          <div class="hero__top">
            <div>
              <p class="eyebrow" id="hero-title">
                Last feed
              </p>
              <p class="ago">{formatAgo(now - feedStart(feed))}</p>
              <p class="sub">
                Started {formatClock(feedStart(feed))}
                {lasted > 0 && ` · lasted ${formatDuration(lasted)}`}
              </p>
            </div>
          </div>
          {side && (
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
          )}
          {bottle && (
            <div class="last-side">
              <Icon name="bottle" size={72} />
              <div>
                <p class="eyebrow">{side ? 'Plus a bottle' : 'Bottle'}</p>
                <p class="last-side__name">{bottle.ml ? `${bottle.ml} ml` : milkLabel(bottle.milk)}</p>
              </div>
              {bottle.ml !== null && <span class="muted">{milkLabel(bottle.milk)}</span>}
            </div>
          )}
          {reminder && (
            <ReminderLine reminder={reminder} enabled={remindersEnabled} now={now} onOpenSettings={onOpenSettings} />
          )}
          {lastPump && <PumpLine feed={lastPump} now={now} />}
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
      <OtherStarts onPump={onPump} onBottle={onBottle} />
    </section>
  )
}
