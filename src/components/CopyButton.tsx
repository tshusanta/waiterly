import { useEffect, useState } from 'react'
import { Check, ClipboardCopy } from 'lucide-react'
import { copyText } from '../lib/clipboard'

interface Props {
  text: string
  label?: string
  className?: string
}

/** "Copy for POS" with a short "Copied" confirmation. */
export function CopyButton({ text, label = 'Copy for POS', className = 'btn btn-ghost' }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = window.setTimeout(() => setState('idle'), 2_000)
    return () => window.clearTimeout(id)
  }, [state])

  return (
    <button
      type="button"
      className={className}
      disabled={!text}
      onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}
      title={text}
    >
      {state === 'copied' ? (
        <Check size={16} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <ClipboardCopy size={16} strokeWidth={1.5} aria-hidden="true" />
      )}
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}</span>
    </button>
  )
}
