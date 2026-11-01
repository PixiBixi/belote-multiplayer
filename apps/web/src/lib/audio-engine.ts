import type { SoundName } from './sounds.js'

/**
 * Every sound is synthesised, so the app ships no audio files at all - no binary
 * blobs in the repository, nothing added to the image, no licences to track, and
 * each sound is a few numbers that can be tuned by editing them.
 *
 * Nothing here is unit-testable: jsdom has no Web Audio. The decision of WHICH
 * sound to play lives in sounds.ts and is tested there; this file only turns a
 * name into noise, and is checked in a real browser.
 */
export type AudioEngine = {
  /** Safe to call before the context is unlocked; it simply does nothing. */
  play: (name: SoundName) => void
  /**
   * Browsers create an AudioContext suspended and keep it that way until a user
   * gesture. Call this from a real click or keypress or everything stays silent.
   */
  unlock: () => void
  close: () => void
}

type Recipe = (context: AudioContext, out: GainNode, at: number) => void

/** A pitched blip, optionally sweeping to a second frequency. */
function tone(
  context: AudioContext,
  out: GainNode,
  at: number,
  options: {
    from: number
    to?: number
    duration: number
    type?: OscillatorType
    gain?: number
  },
): void {
  const osc = context.createOscillator()
  const level = context.createGain()
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.from, at)
  if (options.to !== undefined) {
    // Exponential, not linear: pitch is perceived logarithmically, so a linear
    // ramp sounds like it slows down as it falls.
    osc.frequency.exponentialRampToValueAtTime(Math.max(options.to, 1), at + options.duration)
  }

  const peak = options.gain ?? 0.25
  /* A 8ms attack rather than an instant one. Starting a gain at full level
     produces a click of its own - the discontinuity is itself a waveform. */
  level.gain.setValueAtTime(0.0001, at)
  level.gain.exponentialRampToValueAtTime(peak, at + 0.008)
  level.gain.exponentialRampToValueAtTime(0.0001, at + options.duration)

  osc.connect(level).connect(out)
  osc.start(at)
  osc.stop(at + options.duration + 0.02)
}

/** Filtered white noise: the papery part of a card landing on felt. */
function noise(
  context: AudioContext,
  out: GainNode,
  at: number,
  options: { duration: number; cutoff: number; gain?: number },
): void {
  const frames = Math.max(1, Math.floor(context.sampleRate * options.duration))
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) {
    // Fades across the buffer so the noise tails off instead of stopping dead.
    channel[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(options.cutoff, at)
  filter.Q.setValueAtTime(0.8, at)

  const level = context.createGain()
  level.gain.setValueAtTime(options.gain ?? 0.2, at)

  source.connect(filter).connect(level).connect(out)
  source.start(at)
}

/*
 * The kit. Loudness is deliberately uneven: a card landing happens dozens of times a
 * hand and has to stay in the background, while a coinche is rare and meant to land.
 */
const RECIPES: Record<SoundName, Recipe> = {
  card: (context, out, at) => {
    // A soft snap: a papery tick with a short low body.
    noise(context, out, at, { duration: 0.06, cutoff: 2600, gain: 0.13 })
    tone(context, out, at, { from: 320, to: 190, duration: 0.07, type: 'triangle', gain: 0.07 })
  },

  trickWon: (context, out, at) => {
    // Two bright rising notes: our team took it.
    for (const [index, freq] of [784, 1047].entries()) {
      tone(context, out, at + index * 0.08, { from: freq, duration: 0.2, gain: 0.1 })
    }
  },

  trickLost: (context, out, at) => {
    // One dull, lower note: theirs, and not worth more.
    tone(context, out, at, { from: 330, to: 262, duration: 0.18, gain: 0.06 })
  },

  bid: (context, out, at) => {
    tone(context, out, at, { from: 660, duration: 0.1, type: 'triangle', gain: 0.09 })
  },

  coinche: (context, out, at) => {
    // The sting: a falling saw with a noise crack on top.
    tone(context, out, at, { from: 300, to: 70, duration: 0.35, type: 'sawtooth', gain: 0.18 })
    tone(context, out, at, { from: 296, to: 68, duration: 0.35, type: 'square', gain: 0.08 })
    noise(context, out, at, { duration: 0.2, cutoff: 800, gain: 0.2 })
  },

  belote: (context, out, at) => {
    // A little flourish, four quick notes up.
    for (const [index, freq] of [659, 784, 988, 1319].entries()) {
      tone(context, out, at + index * 0.06, { from: freq, duration: 0.14, gain: 0.09 })
    }
  },

  yourTurn: (context, out, at) => {
    // Two soft notes, quiet on purpose: fires when attention is elsewhere.
    tone(context, out, at, { from: 587, duration: 0.13, gain: 0.1 })
    tone(context, out, at + 0.12, { from: 784, duration: 0.18, gain: 0.1 })
  },

  timedOut: (context, out, at) => {
    // Falling and dry: a turn being taken away, not a card played.
    tone(context, out, at, { from: 300, to: 120, duration: 0.18, type: 'square', gain: 0.09 })
    noise(context, out, at + 0.02, { duration: 0.1, cutoff: 700, gain: 0.1 })
  },

  /* Four endings: winning and watching the other team win are different events, and one
     shared cue congratulates the loser. Same intervals, moving the other way. */

  handWon: (context, out, at) => {
    for (const [index, freq] of [523, 659, 784].entries()) {
      tone(context, out, at + index * 0.08, { from: freq, duration: 0.22, gain: 0.12 })
    }
  },

  handLost: (context, out, at) => {
    for (const [index, freq] of [392, 330, 262].entries()) {
      tone(context, out, at + index * 0.085, { from: freq, duration: 0.24, gain: 0.075 })
    }
  },

  gameWon: (context, out, at) => {
    // Once per game, so the biggest thing in the kit: a run, a held chord, a top octave.
    for (const [index, freq] of [523, 659, 784, 1047].entries()) {
      tone(context, out, at + index * 0.11, {
        from: freq,
        duration: 0.3,
        type: 'triangle',
        gain: 0.13,
      })
    }
    for (const freq of [262, 330, 392]) {
      tone(context, out, at + 0.44, { from: freq, duration: 0.9, gain: 0.07 })
    }
    tone(context, out, at + 0.52, { from: 1568, duration: 0.7, type: 'triangle', gain: 0.11 })
  },

  gameLost: (context, out, at) => {
    // A settled cadence: final, not a celebration.
    for (const [index, freq] of [392, 349, 294].entries()) {
      tone(context, out, at + index * 0.13, { from: freq, duration: 0.34, gain: 0.085 })
    }
    tone(context, out, at + 0.39, { from: 196, duration: 0.7, gain: 0.075 })
  },
}

export function createAudioEngine(): AudioEngine | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null

  let context: AudioContext | null = null
  let master: GainNode | null = null

  const ensure = (): { context: AudioContext; master: GainNode } | null => {
    try {
      if (context === null) {
        context = new AudioContext()
        master = context.createGain()
        // One master trim, so every recipe can be written at a comfortable level
        // and the whole kit moves together.
        master.gain.value = 0.9
        master.connect(context.destination)
      }
      return master === null ? null : { context, master }
    } catch {
      // A browser that refuses to construct a context is a browser that plays no
      // sound. It is not a browser that fails to play the game.
      return null
    }
  }

  return {
    unlock: () => {
      const ready = ensure()
      if (ready === null) return
      if (ready.context.state === 'suspended') void ready.context.resume()
    },

    play: (name) => {
      const ready = ensure()
      if (ready === null) return

      const emit = () => {
        try {
          // Read currentTime here, not before the await: on the resumed path the
          // clock has moved on, and scheduling in the past drops the sound.
          RECIPES[name](ready.context, ready.master, ready.context.currentTime)
        } catch {
          /* A sound failing is never a reason for a turn to fail. */
        }
      }

      /* The very first cue of a session races the unlock. Measuring in a real
         browser showed the context is not even constructed until then - if that
         first cue happens to be the gesture that unlocks it, resume() is still in
         flight and the sound would simply vanish. Resuming and then emitting
         costs a few milliseconds once, and never loses it. */
      if (ready.context.state === 'suspended') {
        void ready.context.resume().then(emit, () => undefined)
        return
      }
      if (ready.context.state !== 'running') return
      emit()
    },

    close: () => {
      const closing = context
      context = null
      master = null
      if (closing !== null) void closing.close().catch(() => undefined)
    },
  }
}
