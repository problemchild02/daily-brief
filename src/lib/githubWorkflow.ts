const DISPATCH_URL =
  'https://api.github.com/repos/problemchild02/daily-brief/actions/workflows/refresh.yml/dispatches'

const PAT_KEY = 'daily-brief:gh-pat'

export function readPat(): string {
  try {
    const v = localStorage.getItem(PAT_KEY)
    if (v) return v
    // Migrate from legacy key written by app.js
    const legacy = localStorage.getItem('daily-brief:settings')
    if (legacy) {
      const parsed = JSON.parse(legacy) as { githubPat?: string }
      return parsed.githubPat ?? ''
    }
  } catch { /* ignore */ }
  return ''
}

export function writePat(pat: string): void {
  try {
    if (pat.trim()) {
      localStorage.setItem(PAT_KEY, pat.trim())
    } else {
      localStorage.removeItem(PAT_KEY)
    }
  } catch { /* ignore */ }
}

export async function dispatchWorkflow(pat: string): Promise<{ ok: boolean; error?: string }> {
  if (!pat.trim()) return { ok: false, error: 'No PAT configured.' }
  try {
    const r = await fetch(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat.trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    })
    if (r.status === 204) return { ok: true }
    const body = await r.json().catch(() => ({})) as { message?: string }
    return { ok: false, error: body.message ?? `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
