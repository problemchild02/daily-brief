import { useEffect, useState } from 'react'

export type Density = 'comfortable' | 'compact' | 'dense'

const STORAGE_KEY = 'daily-brief:density'
const DEFAULT: Density = 'comfortable'

function readStored(): Density {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'comfortable' || v === 'compact' || v === 'dense') return v as Density
  } catch { /* ignore */ }
  return DEFAULT
}

export function useDensity() {
  const [density, setDensityState] = useState<Density>(readStored)

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  function setDensity(d: Density) {
    setDensityState(d)
    document.documentElement.dataset.density = d
    try { localStorage.setItem(STORAGE_KEY, d) } catch { /* ignore */ }
  }

  return { density, setDensity }
}
