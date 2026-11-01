import type { BidEvent, BotLevel, DeclarationKind, Rank, Suit, Trump } from '@belote/engine'
import type { ErrorCode, GameEvent } from '@belote/protocol'
import type { Messages } from './messages.js'

const SUIT_NAME: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }
const RANK_NAME: Record<Rank, string> = {
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
}
const DECL: Record<DeclarationKind, string> = {
  tierce: 'Tierce',
  cinquante: 'Fifty',
  cent: 'Hundred',
  carre: 'Four of a kind',
}
const LEVEL: Record<BotLevel, string> = { easy: 'Beginner', normal: 'Intermediate', hard: 'Expert' }

const trumpName = (t: Trump): string =>
  t === 'AT' ? 'All trumps' : t === 'SA' ? 'No trumps' : SUIT_NAME[t]

const bidValue = (v: number): string => (v === 250 ? 'Capot' : v === 500 ? 'Generale' : String(v))

const bidBubble = (bid: BidEvent): string => {
  switch (bid.type) {
    case 'pass':
      return 'Pass'
    case 'take':
      return trumpName(bid.trump)
    case 'bid':
      return `${bidValue(bid.value)} ${trumpName(bid.trump)}`
    case 'coinche':
      return 'Coinche!'
    case 'surcoinche':
      return 'Surcoinche!'
  }
}

/** The English catalogue: same shape as French, which is the reference language. */
export const en: Messages = {
  brand: 'Belote',
  tagline: 'Belote with friends, online. Classic or Coinche.',
  rankShort: { '7': '7', '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A' },
  suitName: SUIT_NAME,
  card: (rank, suit) => `${RANK_NAME[rank]} of ${SUIT_NAME[suit].toLowerCase()}`,
  trumpName,
  bidValue,
  declarationName: (kind) => DECL[kind],
  botLevel: LEVEL,

  connection: { lost: 'Connection lost. Reload the page to get your seat back.' },

  home: {
    nameLabel: 'Your name',
    namePlaceholder: 'E.g. Grandma Jean',
    solo: 'Play against the computer',
    soloHint: 'Three bots at your table, you pick the rules.',
    create: 'Create a table',
    createHint: 'Invite your friends with a link.',
    joinTitle: 'Join a table',
    codeLabel: 'Table code',
    join: 'Join',
    language: 'Language',
  },

  lobby: {
    title: (code) => `Table ${code}`,
    invite: 'Invitation link',
    copy: 'Copy',
    copied: 'Copied!',
    copyFailed: 'Could not copy: select the link by hand.',
    teamUs: 'Team 1',
    teamThem: 'Team 2',
    you: 'you',
    host: 'host',
    empty: 'Open seat',
    sitHere: 'Sit here',
    addBot: 'Add a bot',
    removeBot: 'Remove',
    fillBots: 'Fill with bots',
    start: 'Start the game',
    waiting: 'Waiting for players…',
    waitingHost: (name) => `${name} will start the game.`,
    leave: 'Leave',
    rules: 'Table rules',
    variant: 'Variant',
    classic: 'Classic',
    classicHint: 'Take or pass on the turned-up card.',
    coinche: 'Coinche',
    coincheHint: 'Bids from 80 to 160, capot, generale, coinche.',
    allTrumps: 'All trumps / No trumps',
    allTrumpsHint: 'These two contracts can be bid.',
    vache: 'Vache',
    vacheHint: 'If everybody passes, play anyway with no trumps and no taker.',
    pisse: 'Discard instead of trumping',
    pisseHint: 'Discard rather than trump when your partner is winning.',
    overtrump: 'Overtrump',
    overtrumpHint: 'You must play a higher trump when you can.',
    declarations: 'Declarations',
    declarationsHint: 'Tierce, fifty, hundred and fours of a kind count.',
    target: 'Game to',
    points: (n) => `${n} pts`,
    clock: 'Time per turn',
    noClock: 'Unlimited',
    seconds: (n) => `${n} s`,
    teamsHint: 'Partners sit opposite each other. Change seats to pick your partner.',
  },

  table: {
    us: 'Us',
    them: 'Them',
    handNo: (n) => `Hand ${n}`,
    handPoints: (n) => `${n} points this hand`,
    target: (n) => `to ${n}`,
    reserve: (n) => `${n} in reserve`,
    dealer: 'Dealer',
    yourTurn: 'Your turn',
    ledBy: (name) => `Led by ${name}`,
    sortBy: (mode: string) => `Card order: ${mode}. Tap to change`,
    sortModes: {
      alternate: 'Alternating',
      trumpLast: 'Trump on the right',
      fixed: 'Fixed order',
      none: 'Unsorted',
    },
    waitingFor: (name) => `${name} is thinking…`,
    takerLabel: (name) => `${name} took`,
    vacheLabel: 'Vache: nobody took',
    contractLine: (value, trump) =>
      value === null ? trumpName(trump) : `${bidValue(value)} ${trumpName(trump)}`,
    coinched: 'Coinched',
    surcoinched: 'Surcoinched',
    tricks: (n) => (n > 1 ? `${n} tricks` : `${n} trick`),
    take: (trump) =>
      trump === 'AT' || trump === 'SA'
        ? trumpName(trump)
        : `Take ${SUIT_NAME[trump].toLowerCase()}`,
    takeTurned: 'Take',
    pass: 'Pass',
    bid: (value, trump) => `Bid ${bidValue(value)} ${trumpName(trump)}`,
    coinche: 'Coinche!',
    surcoinche: 'Surcoinche!',
    chooseValue: 'Contract',
    chooseTrump: 'Trump',
    roundTwo: 'Second round: another suit?',
    roundOne: 'First round: take the turned card?',
    declare: (names) => `Declare ${names.join(', ')}`,
    lastTrick: 'Last trick',
    scoreSheet: 'Score sheet',
    rules: 'Rules',
    chat: 'Chat',
    leave: 'Leave the table',
    confirmLeave: 'Leave the game? A bot will take your seat.',
    bot: 'bot',
    standingInFor: (name) => `standing in for ${name}`,
    disconnected: 'disconnected',
    noTrickYet: 'No trick played yet.',
    timeLeft: (s) => `${s} s`,
    belote: 'Belote!',
    rebelote: 'Rebelote!',
  },

  bidBubble,

  result: {
    made: 'Contract made!',
    theyMade: 'They made their contract',
    theyFailed: 'They went down!',
    failed: 'We went down...',
    vache: 'Vache',
    litige: 'Tie: the taker’s points go into reserve',
    redeal: 'Everybody passed: redealing.',
    capot: 'Capot!',
    cards: 'Cards and last trick bonus',
    declarations: 'Declarations',
    belote: 'Belote',
    total: 'Scored',
    next: 'Next hand',
    nextIn: (s) => `Next hand in ${s} s`,
  },

  over: {
    weWon: 'Victory!',
    weLost: 'Defeat',
    winners: (a, b) => `${a} and ${b} win the game`,
    again: 'New game',
    waitHost: 'The host can start a new game.',
    hands: (n) => (n > 1 ? `${n} hands` : `${n} hand`),
  },

  sheet: {
    title: 'Score sheet',
    hand: '#',
    contract: 'Contract',
    empty: 'No hand finished yet.',
    close: 'Close',
  },

  rulesInPlay: {
    title: 'Rules of this table',
    on: 'yes',
    off: 'no',
  },

  chat: {
    placeholder: 'Write a message…',
    send: 'Send',
    title: 'Chat',
    label: 'Table chat and log',
    messageLabel: 'Message the table',
    collapse: 'Collapse the chat',
    you: 'You',
  },

  voice: {
    label: 'Voice',
    join: 'Join voice',
    joining: 'Connecting…',
    leave: 'Leave voice',
    mute: 'Mute my microphone',
    unmute: 'Unmute my microphone',
    alone: 'Nobody else is in voice yet.',
    noMicrophone: 'Microphone unavailable. Allow microphone access in your browser.',
    peerMuted: (name) => `${name} has muted their microphone`,
    unavailableWith: (name) => `Voice unavailable with ${name}`,
    muteThem: (name) => `Mute ${name}`,
    unmuteThem: (name) => `Unmute ${name}`,
  },

  dismissToast: (title) => `Dismiss: ${title}`,

  event: (e: GameEvent, name: (seat: number) => string): string | null => {
    switch (e.type) {
      case 'handStarted':
        return `Hand ${e.number}, ${name(e.dealer)} deals.`
      case 'bid':
        return `${name(e.bid.seat)}: ${bidBubble(e.bid)}`
      case 'declared':
        return `${name(e.seat)} declares ${e.kinds.map((k) => DECL[k].toLowerCase()).join(', ')}`
      case 'belote':
        return `${name(e.seat)}: ${e.call === 'belote' ? 'Belote!' : 'Rebelote!'}`
      case 'trickWon':
        return `${name(e.seat)} wins the trick (${e.points} pts)`
      case 'redeal':
        return 'Everybody passes, redealing.'
      case 'handEnded':
        return `End of the hand: ${e.result.scored[0]} to ${e.result.scored[1]}`
      case 'gameEnded':
        return 'Game over!'
      case 'turnTimedOut':
        return `${name(e.seat)} ran out of time, a card was played for them.`
      case 'botTookOver':
        return `A bot takes ${name(e.seat)}’s seat.`
      case 'seatDisconnected':
        return `${name(e.seat)} disconnected.`
      case 'seatReconnected':
        return `${name(e.seat)} is back.`
      case 'seatLeft':
        return `${name(e.seat)} left the table.`
      case 'gameRestarted':
        return 'New game!'
      default:
        return null
    }
  },

  error: {
    room_not_found: 'This table does not exist (any more).',
    room_full: 'The table is full.',
    invalid_payload: 'Invalid request.',
    not_host: 'Only the host can do that.',
    seats_not_filled: 'Four players (or bots) are needed to start.',
    seat_taken: 'That seat is taken.',
    game_already_started: 'The game has already started.',
    game_not_started: 'The game has not started.',
    illegal_move: 'That move is not allowed.',
    not_your_turn: 'It is not your turn.',
    rate_limited: 'Easy! Try again in a moment.',
    invalid_session: 'Session expired.',
    server_full: 'The server is full, try again later.',
    hand_in_progress: 'The hand is not over yet.',
    game_over: 'The game is over.',
    voice_not_joined: 'You are not in the voice room.',
    voice_peer_unavailable: 'This player cannot be reached in voice.',
  } satisfies Record<ErrorCode, string>,

  crash: {
    title: 'Oops, the table slipped.',
    seatHeld: 'Your seat is held: reload the page to resume the game.',
    reload: 'Reload',
  },
}
