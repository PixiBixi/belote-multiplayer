import { SORT_MODES, type SortMode } from './sort-hand.js'

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

const SORT_KEY = 'belote.pref.sort'

/** Unknown or unreadable values fall back to the default order. */
export function readSortMode(): SortMode {
  try {
    const v = window.localStorage.getItem(SORT_KEY)
    return SORT_MODES.find((m) => m === v) ?? 'alternate'
  } catch {
    return 'alternate'
  }
}

export function writeSortMode(mode: SortMode): void {
  try {
    window.localStorage.setItem(SORT_KEY, mode)
  } catch {
    /* The preference will not survive a reload. Play continues. */
  }
}
