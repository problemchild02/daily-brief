import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Droplets } from 'lucide-react'
import { useWeather } from '../../hooks/useWeather'
import type { CityWeather } from '../../hooks/useWeather'

function wmoIcon(code: number) {
  if (code === 0) return <Sun size={13} />
  if (code <= 2)  return <Cloud size={13} className="opacity-70" />
  if (code <= 48) return <Cloud size={13} />
  if (code <= 67) return <CloudRain size={13} />
  if (code <= 77) return <CloudSnow size={13} />
  if (code <= 82) return <CloudRain size={13} />
  return <CloudLightning size={13} />
}

function CityBlock({ weather }: { weather: CityWeather }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="text-ink-3">{wmoIcon(weather.conditionCode)}</span>
      <span className="font-medium text-ink">{weather.city}</span>
      <span className="text-ink">{weather.tempC}°</span>
      <span className="text-ink-3">{weather.conditionLabel}</span>
      {weather.nextRainHour && (
        <span className="text-ink-3 flex items-center gap-0.5">
          <Droplets size={11} />
          {weather.nextRainHour}
        </span>
      )}
    </span>
  )
}

interface WeatherStripProps {
  className?: string
}

export function WeatherStrip({ className = '' }: WeatherStripProps) {
  const { data, loading } = useWeather()

  if (loading) {
    return (
      <div
        className={`flex items-center gap-4 ${className}`}
        style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
      >
        <span className="text-ink-3 animate-pulse">Weather loading…</span>
      </div>
    )
  }

  if (!data || data.length === 0) return null

  // Home city first
  const homeCity = (() => {
    try {
      const v = localStorage.getItem('daily-brief:home-city')
      return v === 'Mumbai' || v === 'Noida' ? v : 'Mumbai'
    } catch {
      return 'Mumbai'
    }
  })()

  const sorted = [...data].sort((a, b) =>
    a.city === homeCity ? -1 : b.city === homeCity ? 1 : 0,
  )

  return (
    <div
      className={`flex items-center gap-4 flex-wrap ${className}`}
      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
      aria-label="Current weather"
    >
      {sorted.map((w, i) => (
        <span key={w.city} className="flex items-center gap-4">
          {i > 0 && <span className="text-rule select-none" aria-hidden>|</span>}
          <CityBlock weather={w} />
        </span>
      ))}
    </div>
  )
}
