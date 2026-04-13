import { useOutletContext } from 'react-router-dom'

export interface DefenseModeOutletContext {
  defenseMode: boolean
}

export function useDefenseMode() {
  return useOutletContext<DefenseModeOutletContext>()
}
