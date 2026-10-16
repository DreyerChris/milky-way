import type { JSX } from 'preact'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'preact/hooks'
import { ActiveFeed } from './components/ActiveFeed'
import { History } from './components/History'
import { Icon } from './components/Icon'
import { LastFeed } from './components/LastFeed'
import { QuickLog } from './components/QuickLog'
import { SettingsSheet } from './components/SettingsSheet'
import type { ToastMessage } from './components/Toast'
import { Toast } from './components/Toast'
import { activeFeed, createEntry, finishedFeeds, isRunning, latestFeed, nextReminder, nextStartSide, reducer } from './feeds'
import { useNow } from './hooks'
import type { InstallPromptEvent, ReminderStatus } from './pwa'
import { REMINDERS_OFF, registerServiceWorker, syncReminder } from './pwa'
import type { TagId } from './tags'
import { tagById } from './tags'
import type { Side } from './types'
import { STORAGE_KEY, loadState, parseState, requestPersistentStorage, saveState } from './storage'

export function App(): JSX.Element {
  const initial = useMemo(loadState, [])
  const [state, dispatch] = useReducer(reducer, initial.state)
  const [error, setError] = useState<string | null>(initial.error)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>(REMINDERS_OFF)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const active = activeFeed(state)
  const now = useNow(active && isRunning(active) ? 1000 : 20_000)
  const reminder = nextReminder(state)
  const startSide = nextStartSide(state)

  const startFeed = useCallback((side?: Side): void => dispatch({ type: 'start', now: Date.now(), side }), [])

  const logEntry = (tags: readonly TagId[], note: string | null): void => {
    const entry = createEntry(Date.now(), tags, note)
    dispatch({ type: 'log-entry', entry })
    const what = tags.length > 0 ? tags.map((t) => tagById(t).label.toLowerCase()).join(', ') : 'note'
    setToast({ id: entry.id, text: `Logged ${what}`, undo: () => dispatch({ type: 'delete-entry', id: entry.id }) })
  }

  useEffect(() => {
    setError(saveState(state))
  }, [state])

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) return
      try {
        dispatch({ type: 'replace', state: parseState(event.newValue) })
      } catch (err) {
        console.error('milky way: could not sync from another tab', err)
      }
    }
    const onInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
    }
  }, [])

  useEffect(() => {
    void registerServiceWorker(() => startFeed())
    void requestPersistentStorage()
    const params = new URLSearchParams(window.location.search)
    if (params.get('start') === '1') {
      startFeed()
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [startFeed])

  useEffect(() => {
    let current = true
    void syncReminder(reminder, state.settings.remindersEnabled, startSide).then((status) => {
      if (current) setReminderStatus(status)
    })
    return () => {
      current = false
    }
  }, [reminder?.at, reminder?.night, state.settings.remindersEnabled, startSide])

  return (
    <div class="app">
      <header class="topbar">
        <h1 class="brand">
          <Icon name="app" size={34} />
          milky way
        </h1>
        <button
          type="button"
          class={`icon-btn bell-btn ${state.settings.remindersEnabled ? 'is-on' : ''}`}
          aria-label={`Reminders and settings${state.settings.remindersEnabled ? ', reminders on' : ', reminders off'}`}
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="bell" size={34} />
        </button>
      </header>

      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}

      <main>
        {active ? (
          <ActiveFeed feed={active} now={now} dispatch={dispatch} />
        ) : (
          <LastFeed
            feed={latestFeed(state)}
            startSide={startSide}
            reminder={reminder}
            remindersEnabled={state.settings.remindersEnabled}
            now={now}
            onStart={startFeed}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        {!active && <QuickLog onLog={logEntry} />}
        <History feeds={finishedFeeds(state)} entries={state.entries} now={now} dispatch={dispatch} />
      </main>

      <SettingsSheet
        open={settingsOpen}
        settings={state.settings}
        reminderStatus={reminderStatus}
        installPrompt={installPrompt}
        onInstalled={() => setInstallPrompt(null)}
        onClose={() => setSettingsOpen(false)}
        dispatch={dispatch}
      />

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}
