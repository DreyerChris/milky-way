import type { Reminder } from './feeds'
import { formatClock, sideLabel } from './format'
import type { Side } from './types'

const NOTIFIED_KEY = 'milkyway:notified-at'
const OVERDUE_GRACE_MS = 10 * 60_000
const BASE = import.meta.env.BASE_URL

export interface InstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

export type ReminderMode = 'off' | 'push' | 'local'

export interface ReminderStatus {
  readonly mode: ReminderMode
  readonly problem: string | null
}

export const REMINDERS_OFF: ReminderStatus = { mode: 'off', problem: null }

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { readonly standalone?: boolean }).standalone === true

export const isIOS = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const notificationsSupported = (): boolean => 'Notification' in window && 'serviceWorker' in navigator

export const pushSupported = (): boolean => notificationsSupported() && 'PushManager' in window

export const registerServiceWorker = async (onStartFeed: () => void): Promise<void> => {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'start-feed') onStartFeed()
  })
  try {
    await navigator.serviceWorker.register(`${BASE}sw.js`)
  } catch (err) {
    console.error('milky way: service worker registration failed', err)
  }
}

export const showFeedNotification = async (body: string): Promise<void> => {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Time for a feed', {
    body,
    tag: 'feed-reminder',
    icon: `${BASE}icons/app-192.png`,
    badge: `${BASE}icons/badge-96.png`,
    requireInteraction: true,
    data: { url: `${BASE}?start=1` },
  })
}

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

const SERVER_KEY = base64UrlToBytes(import.meta.env.VITE_VAPID_PUBLIC_KEY)

const sameKey = (current: ArrayBuffer | null): boolean => {
  if (!current || current.byteLength !== SERVER_KEY.length) return false
  const bytes = new Uint8Array(current)
  return SERVER_KEY.every((b, i) => bytes[i] === b)
}

const getPushSubscription = async (subscribeIfMissing: boolean): Promise<PushSubscription | null> => {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing && sameKey(existing.options.applicationServerKey)) return existing
  if (existing) await existing.unsubscribe()
  if (!subscribeIfMissing) return null
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: SERVER_KEY })
}

const callApi = async (method: 'PUT' | 'POST' | 'DELETE', path: string, body: unknown): Promise<void> => {
  const res = await fetch(`${BASE}api/push/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Reminder server answered ${res.status} for ${path}`)
}

export const enableReminders = async (): Promise<NotificationPermission> => {
  if (pushSupported()) {
    try {
      await getPushSubscription(true)
      return Notification.permission
    } catch (err) {
      console.error('milky way: push subscription failed, falling back to on-device reminders', err)
      if (Notification.permission === 'denied') return 'denied'
    }
  }
  if (!notificationsSupported()) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch (err) {
    console.error('milky way: notification permission request failed', err)
    return 'denied'
  }
}

export const disableReminders = async (): Promise<void> => {
  if (!pushSupported()) return
  try {
    const subscription = await getPushSubscription(false)
    if (!subscription) return
    await callApi('DELETE', 'subscription', { subscription: subscription.toJSON() })
    await subscription.unsubscribe()
  } catch (err) {
    console.error('milky way: could not remove push subscription', err)
  }
}

export const sendTestReminder = async (): Promise<ReminderMode> => {
  if (pushSupported()) {
    const subscription = await getPushSubscription(true)
    if (subscription) {
      await callApi('POST', 'test', { subscription: subscription.toJSON(), delaySeconds: 15 })
      return 'push'
    }
  }
  await showFeedNotification('This is a test reminder. Tap it to start a feed.')
  return 'local'
}

const reminderText = (reminder: Reminder, side: Side): string => {
  const hours = reminder.night ? 5 : 3
  return `It's been ${hours} hours since the last feed (${formatClock(reminder.at - hours * 3_600_000)}). Tap to start on the ${sideLabel(side).toLowerCase()} side.`
}

const readNotifiedAt = (): number => {
  try {
    return Number(localStorage.getItem(NOTIFIED_KEY) ?? 0)
  } catch {
    return 0
  }
}

const writeNotifiedAt = (at: number): void => {
  try {
    localStorage.setItem(NOTIFIED_KEY, String(at))
  } catch (err) {
    console.warn('milky way: could not record reminder time', err)
  }
}

let localTimer: ReturnType<typeof setTimeout> | undefined

const scheduleLocalReminder = (reminder: Reminder | null, side: Side): void => {
  if (!reminder) return
  const fire = (): void => {
    if (readNotifiedAt() === reminder.at) return
    writeNotifiedAt(reminder.at)
    showFeedNotification(reminderText(reminder, side)).catch((err: unknown) =>
      console.error('milky way: failed to show reminder', err),
    )
  }
  const delay = reminder.at - Date.now()
  if (delay <= 0) {
    if (-delay < OVERDUE_GRACE_MS) fire()
    return
  }
  localTimer = setTimeout(fire, delay)
}

const syncNow = async (reminder: Reminder | null, enabled: boolean, side: Side): Promise<ReminderStatus> => {
  clearTimeout(localTimer)
  localTimer = undefined
  if (!enabled || !notificationsSupported() || Notification.permission !== 'granted') return REMINDERS_OFF

  if (pushSupported()) {
    try {
      const subscription = await getPushSubscription(true)
      if (subscription) {
        const upcoming = reminder && reminder.at > Date.now() ? reminder : null
        await callApi('PUT', 'schedule', {
          subscription: subscription.toJSON(),
          reminder: upcoming && {
            at: upcoming.at,
            title: 'Time for a feed',
            body: reminderText(upcoming, side),
            url: `${BASE}?start=1`,
          },
        })
        return { mode: 'push', problem: null }
      }
    } catch (err) {
      console.error('milky way: could not sync reminder with the server', err)
      scheduleLocalReminder(reminder, side)
      return {
        mode: 'local',
        problem: 'Could not reach the reminder server. Until it can, this phone will try to remind you itself.',
      }
    }
  }

  scheduleLocalReminder(reminder, side)
  return { mode: 'local', problem: null }
}

let queue: Promise<ReminderStatus> = Promise.resolve(REMINDERS_OFF)

export const syncReminder = (reminder: Reminder | null, enabled: boolean, side: Side): Promise<ReminderStatus> => {
  queue = queue.then(
    () => syncNow(reminder, enabled, side),
    () => syncNow(reminder, enabled, side),
  )
  return queue
}
