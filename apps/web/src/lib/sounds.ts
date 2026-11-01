import type { GameEvent } from '@belote/protocol'

export type SoundName =
  | 'card'
  | 'trickWon'
  | 'trickLost'
  | 'bid'
  | 'coinche'
  | 'belote'
  | 'handWon'
  | 'handLost'
  | 'gameWon'
  | 'gameLost'
  | 'yourTurn'
  | 'timedOut'

/**
 * Which sound an event makes. `mySeat` is passed rather than inferred: winning a trick
 * and watching the other team win one are different events to the person hearing them,
 * and a sound that cannot tell them apart congratulates the loser. Team is seat % 2.
 */
export function soundForEvent(event: GameEvent, mySeat: number): SoundName | null {
  const myTeam = mySeat % 2
  switch (event.type) {
    case 'cardPlayed':
      return 'card'
    case 'trickWon':
      return event.seat % 2 === myTeam ? 'trickWon' : 'trickLost'
    case 'bid':
      /* A pass is the commonest bid and carries no news, so it stays silent. */
      if (event.bid.type === 'pass') return null
      return event.bid.type === 'coinche' || event.bid.type === 'surcoinche' ? 'coinche' : 'bid'
    case 'belote':
      return 'belote'
    case 'handEnded': {
      const [mine, theirs] = myTeam === 0 ? event.result.scored : [...event.result.scored].reverse()
      return (mine ?? 0) >= (theirs ?? 0) ? 'handWon' : 'handLost'
    }
    case 'gameEnded':
      return event.winner === myTeam ? 'gameWon' : 'gameLost'
    /* Sounded for everyone: at speed the table needs to hear that play moved on
       without a card being chosen. */
    case 'turnTimedOut':
      return 'timedOut'
    // Silent on purpose: the log already reports these and a noise for each is chatter.
    case 'handStarted':
    case 'declared':
    case 'redeal':
    case 'botTookOver':
    case 'seatDisconnected':
    case 'seatReconnected':
    case 'seatLeft':
    case 'gameRestarted':
      return null
  }
}

/**
 * The cues for one batch of new events, in order. A game ending arrives as handEnded
 * immediately followed by gameEnded; playing both would stack two jingles, so the
 * bigger one wins.
 */
export function soundsForEvents(events: GameEvent[], mySeat: number): SoundName[] {
  const endsGame = events.some((event) => event.type === 'gameEnded')
  return events
    .map((event) => soundForEvent(event, mySeat))
    .filter((name): name is SoundName => name !== null)
    .filter((name) => !(endsGame && (name === 'handWon' || name === 'handLost')))
}
