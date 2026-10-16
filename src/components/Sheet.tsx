import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useId, useRef } from 'preact/hooks'

interface SheetProps {
  readonly title: ComponentChildren
  readonly onClose: () => void
  readonly children: ComponentChildren
  readonly footer?: ComponentChildren
}

export function Sheet({ title, onClose, children, footer }: SheetProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div class="sheet__body">
        <div class="sheet__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        {footer && <div class="sheet__footer">{footer}</div>}
      </div>
    </dialog>
  )
}
