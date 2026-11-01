const MUTED_KEY = 'belote.pref.muted'

/**
 * Sound is on unless someone turned it off. Stored as the exception rather than the
 * state: only the exact string 'true' means muted, so a corrupted value falls back to
 * audible. Storage can be blocked outright, and losing the preference must never break
 * the page.
 */
export function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? 'true' : 'false')
  } catch {
    /* The preference will not survive a reload. Play continues. */
  }
}
