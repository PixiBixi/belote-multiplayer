import { DEFAULT_TABLE_RULES, createGame } from '@belote/engine'
import { describe, expect, it } from 'vitest'
import { randomDealSeed } from './deal-seed.js'
import { RoomManager } from './room-manager.js'

const isWord = (word: number): boolean => Number.isInteger(word) && word >= 0 && word < 2 ** 32

describe('randomDealSeed', () => {
  it('draws four full 32-bit words', () => {
    const seed = randomDealSeed()
    expect(seed).toHaveLength(4)
    for (const word of seed) expect(isWord(word)).toBe(true)
  })

  it('never repeats across draws', () => {
    const seen = new Set(Array.from({ length: 100 }, () => randomDealSeed().join(':')))
    expect(seen.size).toBe(100)
  })
})

describe('deal seeds in a room', () => {
  const botTable = () => {
    const manager = new RoomManager({ maxRooms: 10, gracePeriodMs: 60_000 })
    const created = manager.create(null, DEFAULT_TABLE_RULES)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    for (const seat of [1, 2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'normal' })
    return { manager, room }
  }

  it('records a fresh 128-bit seed for every hand, replayable on its own', () => {
    const { manager, room } = botTable()
    expect(room.start(0, manager.nextSeed()).okay).toBe(true)
    const first = room.dealSeed
    if (first === null || typeof first === 'number') throw new Error('expected a 128-bit seed')
    expect(first).toHaveLength(4)

    const replayed = createGame({ seed: first, rules: DEFAULT_TABLE_RULES })
    expect(room.viewFor(0)?.you.hand).toEqual(replayed.hand.hands[0])
  })

  it('draws its own seed for each hand instead of continuing the last stream', () => {
    const { manager, room } = botTable()
    room.start(0, manager.nextSeed())
    const first = room.dealSeed
    room.leave('socket-0')
    for (let i = 0; i < 20000 && room.dealSeed === first; i++) {
      if (room.botStep().length === 0) room.dealNextHandAutomatically(manager.nextSeed())
    }
    expect(room.dealSeed).not.toBeNull()
    expect(room.dealSeed).not.toEqual(first)
    expect(room.dealSeed).toHaveLength(4)
  })
})
