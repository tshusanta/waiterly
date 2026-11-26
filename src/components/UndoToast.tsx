import { useEffect } from 'react'
import { Undo2 } from 'lucide-react'

export const UNDO_MS = 5_000

interface Props {
  message: string
  onUndo: () => void
  onDone: () => void
}

/** "Added Bring water to Table 4 · Undo". Disappears after 5 seconds. */
export function UndoToast({ message, onUndo, onDone }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onDone, UNDO_MS)
    return () => window.clearTimeout(id)
  }, [message, onDone])

  return (
    <div className="toast" role="status">
      <span className="toast-text">{message}</span>
      <button className="btn btn-ghost btn-toast" onClick={onUndo}>
        <Undo2 size={16} strokeWidth={1.5} aria-hidden="true" /> Undo
      </button>
    </div>
  )
}
