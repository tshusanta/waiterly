import { useCallback, useEffect, useState } from 'react'
import { normalizeTables } from '../../shared/restaurant'
import type { SafeguardEvent, Settings, ShiftState, Task } from '../../shared/types'
import * as S from './shift'

function browserStore(): S.KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** All shift state for the app. Each tester gets their own sandbox in localStorage. */
export function useShift() {
  const store = browserStore()
  const [settings, setSettingsState] = useState<Settings>(() => S.loadSettings(store))
  const [shift, setShift] = useState<ShiftState>(() =>
    S.loadShift(store, Date.now(), S.loadSettings(store).assignedTables),
  )

  useEffect(() => S.saveShift(browserStore(), shift), [shift])
  useEffect(() => S.saveSettings(browserStore(), settings), [settings])

  const setAssignedTables = useCallback((tables: number[]) => {
    setSettingsState({ assignedTables: normalizeTables(tables) })
  }, [])

  return {
    shift,
    settings,
    setAssignedTables,
    addTasks: useCallback((tasks: Task[]) => setShift((s) => S.addTasks(s, tasks)), []),
    completeTask: useCallback((id: string) => setShift((s) => S.completeTask(s, id, Date.now())), []),
    removeTask: useCallback((id: string) => setShift((s) => S.removeTask(s, id)), []),
    undoTask: useCallback((id: string) => setShift((s) => S.undoTask(s, id)), []),
    addLogEvents: useCallback(
      (events: SafeguardEvent[]) => setShift((s) => S.addLogEvents(s, events)),
      [],
    ),
    resetShift: useCallback(
      () => setShift(S.resetShift(browserStore(), Date.now(), settings.assignedTables)),
      [settings.assignedTables],
    ),
  }
}
