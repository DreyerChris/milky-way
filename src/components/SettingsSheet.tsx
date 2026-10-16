import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { DAY_INTERVAL_HOURS, NIGHT_INTERVAL_HOURS } from '../feeds'
import { hourLabel } from '../format'
import type { InstallPromptEvent, ReminderStatus } from '../pwa'
import { disableReminders, enableReminders, isIOS, isStandalone, notificationsSupported, sendTestReminder } from '../pwa'
import type { Action, Settings } from '../types'
import { Icon } from './Icon'

interface SettingsSheetProps {
  readonly open: boolean
  readonly settings: Settings
  readonly reminderStatus: ReminderStatus
  readonly installPrompt: InstallPromptEvent | null
  readonly onInstalled: () => void
  readonly onClose: () => void
  readonly dispatch: (action: Action) => void
}

const HOURS: readonly number[] = Array.from({ length: 24 }, (_, i) => i)

const currentPermission = (): NotificationPermission | 'unsupported' =>
  notificationsSupported() ? Notification.permission : 'unsupported'

export function SettingsSheet({ open, settings, reminderStatus, installPrompt, onInstalled, onClose, dispatch }: SettingsSheetProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [permission, setPermission] = useState(currentPermission)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setPermission(currentPermission())
      setMessage(null)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const toggleReminders = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      dispatch({ type: 'settings', patch: { remindersEnabled: false } })
      await disableReminders()
      return
    }
    const result = await enableReminders()
    setPermission(result)
    if (result === 'granted') {
      dispatch({ type: 'settings', patch: { remindersEnabled: true } })
      setMessage(null)
    } else {
      setMessage(
        result === 'denied'
          ? 'Notifications are blocked. Allow them for milky way in your phone settings, then try again.'
          : 'Notifications were not allowed.',
      )
    }
  }

  const sendTest = async (): Promise<void> => {
    try {
      const mode = await sendTestReminder()
      setMessage(
        mode === 'push'
          ? 'A test reminder is on its way in about 15 seconds. Close the app or lock your phone to check it arrives.'
          : 'Test reminder sent.',
      )
    } catch (err) {
      console.error('milky way: test notification failed', err)
      setMessage('Could not send a test reminder on this device.')
    }
  }

  const install = async (): Promise<void> => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') onInstalled()
  }

  const iosNeedsInstall = isIOS() && !isStandalone()

  return (
    <dialog ref={ref} class="sheet" aria-labelledby="settings-title" onClose={onClose} onCancel={onClose}>
      <div class="sheet__body">
        <div class="sheet__head">
          <h2 id="settings-title">
            <Icon name="bell" size={44} /> Reminders
          </h2>
          <button type="button" class="icon-btn" aria-label="Close settings" onClick={onClose}>
            ✕
          </button>
        </div>

        <label class="toggle">
          <span>
            <strong>Feed reminders</strong>
            <span class="muted">
              Every {DAY_INTERVAL_HOURS}h during the day, {NIGHT_INTERVAL_HOURS}h at night, counted from the start of the
              last feed.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.remindersEnabled && permission === 'granted'}
            disabled={permission === 'unsupported'}
            onChange={(e) => void toggleReminders(e.currentTarget.checked)}
          />
        </label>

        <div class="hours">
          <label>
            <Icon name="sun" size={32} />
            <span>Day starts</span>
            <select
              value={settings.dayStartHour}
              onChange={(e) => dispatch({ type: 'settings', patch: { dayStartHour: Number(e.currentTarget.value) } })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Icon name="moon" size={32} />
            <span>Night starts</span>
            <select
              value={settings.dayEndHour}
              onChange={(e) => dispatch({ type: 'settings', patch: { dayEndHour: Number(e.currentTarget.value) } })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {settings.remindersEnabled && permission === 'granted' && (
          <button type="button" class="pill-btn" onClick={() => void sendTest()}>
            Send a test reminder
          </button>
        )}

        {message && (
          <p class="note" role="status">
            {message}
          </p>
        )}

        {permission === 'unsupported' && (
          <p class="note">
            {iosNeedsInstall
              ? 'On iPhone, reminders only work after you add milky way to your Home Screen.'
              : 'This browser does not support notifications.'}
          </p>
        )}

        {reminderStatus.problem && <p class="note">{reminderStatus.problem}</p>}

        {reminderStatus.mode === 'push' && (
          <p class="note note--soft">Reminders are sent by the milky way server, so they arrive even when the app is closed.</p>
        )}
        {reminderStatus.mode === 'local' && !reminderStatus.problem && (
          <p class="note note--soft">
            This browser can't receive server reminders, so milky way can only remind you while it is open or was opened
            recently.
          </p>
        )}

        <div class="install">
          <h3>Add to Home Screen</h3>
          {isStandalone() ? (
            <p class="muted">milky way is installed.</p>
          ) : installPrompt ? (
            <button type="button" class="pill-btn" onClick={() => void install()}>
              Install milky way
            </button>
          ) : iosNeedsInstall ? (
            <p class="muted">In Safari, tap the Share button, then “Add to Home Screen”.</p>
          ) : (
            <p class="muted">Use your browser menu and choose “Install app” or “Add to Home Screen”.</p>
          )}
        </div>
      </div>
    </dialog>
  )
}
