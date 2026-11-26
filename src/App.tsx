import { UtensilsCrossed } from 'lucide-react'
import { RESTAURANT } from '../shared/restaurant'
import { doneTasks, openTasks } from './state/shift'
import { useShift } from './state/useShift'

// Phase 1 shell: proves the data model, seed and localStorage are wired up.
// The real Service / Floor stats views are built in Phase 3 and 4.
export default function App() {
  const { shift, settings, completeTask, resetShift } = useShift()
  const open = openTasks(shift)

  return (
    <main className="shell">
      <h1>
        <UtensilsCrossed size={20} strokeWidth={1.5} aria-hidden="true" /> TableTap
      </h1>
      <p className="muted">
        {RESTAURANT.name} · Section {settings.assignedTables.join(', ')} · {open.length} open,{' '}
        {doneTasks(shift).length} done
      </p>
      <ul>
        {open.map((t) => (
          <li key={t.id}>
            <button onClick={() => completeTask(t.id)}>Done</button> Table {t.table} · {t.text} ·{' '}
            {t.priority}
            {t.flags.length ? ` · ${t.flags.join(', ').toUpperCase()}` : ''}
          </li>
        ))}
      </ul>
      <button onClick={resetShift}>Reset shift</button>
    </main>
  )
}
