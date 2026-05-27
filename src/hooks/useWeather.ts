import { useEffect, useState } from 'react'

export interface CityWeather {
  city: 'Mumbai' | 'Noida'
  tempC: number
  conditionCode: number
  conditionLabel: string
  nextRainHour?: string  // "HH:MM" if rain probability > 60% in next 6h
}

const CITIES = [
  { name: 'Mumbai' as const, lat: 19.0760, lon: 72.8777 },
  { name: 'Noida'  as const, lat: 28.5355, lon: 77.3910 },
]

export function wmoLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow showers'
  if (code <= 99) return 'Thunderstorm'
  return '—'
}

function findNextRainHour(
  hourly: { time: string[]; precipitation_probability: number[] },
): string | undefined {
  const idx = hourly.precipitation_probability.findIndex(p => p > 60)
  if (idx === -1) return undefined
  return hourly.time[idx].slice(11, 16)
}

export function useWeather() {
  const [data, setData] = useState<CityWeather[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const lats = CITIES.map(c => c.lat).join(',')
    const lons = CITIES.map(c => c.lon).join(',')
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lats}&longitude=${lons}` +
      `&current=temperature_2m,weather_code` +
      `&hourly=precipitation_probability` +
      `&forecast_hours=6&timezone=Asia%2FKolkata`

    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => {
        // Open-Meteo returns an array when multiple coordinates are passed
        const responses: Record<string, unknown>[] = Array.isArray(json) ? json : [json]
        const parsed: CityWeather[] = responses.map((r, i) => {
          const current = r.current as { temperature_2m: number; weather_code: number }
          const hourly = r.hourly as { time: string[]; precipitation_probability: number[] }
          return {
            city: CITIES[i].name,
            tempC: Math.round(current.temperature_2m),
            conditionCode: current.weather_code,
            conditionLabel: wmoLabel(current.weather_code),
            nextRainHour: findNextRainHour(hourly),
          }
        })
        setData(parsed)
      })
      .catch(() => { /* silently fail — show "—" */ })
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}
