import type { RefObject } from 'react'
import { highestFeedId, type FeedEntry } from './game-reducer.js'

/**
 * Entries added to `feed` since `lastFeedId`, and advances the ref past them. Callers
 * replay only what arrived since their last look, never a reconnect's whole backlog,
 * and seed `lastFeedId` at what is already on screen before calling this.
 */
export function freshFeedEntries(feed: FeedEntry[], lastFeedId: RefObject<number>): FeedEntry[] {
  const fresh = feed.filter((entry) => entry.id > lastFeedId.current)
  if (fresh.length > 0) lastFeedId.current = highestFeedId(fresh)
  return fresh
}
