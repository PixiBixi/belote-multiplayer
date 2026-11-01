import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@belote/protocol'
import { describe, expect, it } from 'vitest'
import { generateRoomCode } from './room-code.js'

describe('generateRoomCode', () => {
  it('has the contract length and only unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode()
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      expect([...code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true)
    }
  })
})
