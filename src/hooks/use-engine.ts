import { useSyncExternalStore } from 'react'
import { engine } from '@/lib/engine'
import type { Snapshot } from '@/lib/types'

export function useEngine(): Snapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}
