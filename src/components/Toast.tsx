import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'

export interface ToastMessage {
  readonly id: string
  readonly text: string
  readonly undo?: () => void
}

interface ToastProps {
  readonly toast: ToastMessage | null
  readonly onDone: () => void
}

const VISIBLE_MS = 5000

export function Toast({ toast, onDone }: ToastProps): JSX.Element {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDone, VISIBLE_MS)
    return () => clearTimeout(id)
  }, [toast?.id])

  return (
    <div class="toast-region" role="status" aria-live="polite">
      {toast && (
        <div class="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              class="toast__undo"
              onClick={() => {
                toast.undo?.()
                onDone()
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
