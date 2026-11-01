import { beforeEach, describe, expect, it } from 'vitest'
import { readMuted, writeMuted } from './preferences.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('muted preference', () => {
  it('is audible by default', () => {
    expect(readMuted()).toBe(false)
  })

  it('round-trips a choice', () => {
    writeMuted(true)
    expect(readMuted()).toBe(true)
    writeMuted(false)
    expect(readMuted()).toBe(false)
  })

  it('treats anything but the exact string true as audible', () => {
    window.localStorage.setItem('belote.pref.muted', 'wat')
    expect(readMuted()).toBe(false)
  })

  it('degrades instead of throwing when storage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked')
      },
    })
    try {
      expect(readMuted()).toBe(false)
      expect(() => writeMuted(true)).not.toThrow()
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
    }
  })
})
