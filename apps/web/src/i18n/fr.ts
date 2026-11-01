import type { BidEvent, BotLevel, DeclarationKind, Rank, Suit, Trump } from '@belote/engine'
import type { ErrorCode, GameEvent } from '@belote/protocol'

const SUIT_NAME: Record<Suit, string> = { S: 'Pique', H: 'Cœur', D: 'Carreau', C: 'Trèfle' }
const RANK_NAME: Record<Rank, string> = {
  '7': 'Sept',
  '8': 'Huit',
  '9': 'Neuf',
  '10': 'Dix',
  J: 'Valet',
  Q: 'Dame',
  K: 'Roi',
  A: 'As',
}
const DECL: Record<DeclarationKind, string> = {
  tierce: 'Tierce',
  cinquante: 'Cinquante',
  cent: 'Cent',
  carre: 'Carré',
}
const LEVEL: Record<BotLevel, string> = { easy: 'Débutant', normal: 'Confirmé', hard: 'Expert' }

const trumpName = (t: Trump): string =>
  t === 'AT' ? 'Tout atout' : t === 'SA' ? 'Sans atout' : SUIT_NAME[t]

const bidValue = (v: number): string => (v === 250 ? 'Capot' : v === 500 ? 'Générale' : String(v))

/**
 * The French catalogue, and the shape every other language fills in: `Messages` is
 * `typeof fr`. Variable entries are whole-sentence functions, never fragments.
 */
export const fr = {
  brand: 'Belote',
  tagline: 'La belote entre amis, en ligne. Classique ou coinchée.',
  rankShort: { '7': '7', '8': '8', '9': '9', '10': '10', J: 'V', Q: 'D', K: 'R', A: 'A' } as Record<
    Rank,
    string
  >,
  suitName: SUIT_NAME,
  card: (rank: Rank, suit: Suit) => `${RANK_NAME[rank]} de ${SUIT_NAME[suit].toLowerCase()}`,
  trumpName,
  bidValue,
  declarationName: (kind: DeclarationKind) => DECL[kind],
  botLevel: LEVEL,

  connection: { lost: 'Connexion perdue. Recharge la page pour reprendre ta place.' },

  home: {
    nameLabel: 'Ton prénom',
    namePlaceholder: 'Ex. Mamie Jeanne',
    solo: 'Jouer contre l’ordinateur',
    soloHint: 'Trois bots à ta table, tu choisis les règles.',
    create: 'Créer une table',
    createHint: 'Invite tes amis avec un lien.',
    joinTitle: 'Rejoindre une table',
    codeLabel: 'Code de la table',
    join: 'Rejoindre',
    language: 'Langue',
  },

  lobby: {
    title: (code: string) => `Table ${code}`,
    invite: 'Lien d’invitation',
    copy: 'Copier',
    copied: 'Copié !',
    copyFailed: 'Copie impossible : sélectionne le lien à la main.',
    teamUs: 'Équipe 1',
    teamThem: 'Équipe 2',
    you: 'toi',
    host: 'hôte',
    empty: 'Place libre',
    sitHere: 'S’asseoir ici',
    addBot: 'Ajouter un bot',
    removeBot: 'Retirer',
    fillBots: 'Compléter avec des bots',
    start: 'Lancer la partie',
    waiting: 'En attente des joueurs…',
    waitingHost: (name: string) => `${name} va lancer la partie.`,
    leave: 'Quitter',
    rules: 'Règles de la table',
    variant: 'Variante',
    classic: 'Classique',
    classicHint: 'On prend ou on passe sur la carte retournée.',
    coinche: 'Coinche',
    coincheHint: 'Enchères de 80 à 160, capot, générale, coinche.',
    allTrumps: 'Tout atout / Sans atout',
    allTrumpsHint: 'Ces deux contrats peuvent être annoncés.',
    vache: 'Vache',
    vacheHint: 'Si tout le monde passe, on joue quand même en sans atout, sans preneur.',
    pisse: 'Pisser',
    pisseHint: 'Se défausser au lieu de couper quand le partenaire est maître.',
    overtrump: 'Monter à l’atout',
    overtrumpHint: 'Obligation de jouer plus fort à l’atout quand on le peut.',
    declarations: 'Annonces',
    declarationsHint: 'Tierce, cinquante, cent et carrés comptent.',
    target: 'Partie en',
    points: (n: number) => `${n} pts`,
    clock: 'Temps par tour',
    noClock: 'Libre',
    seconds: (n: number) => `${n} s`,
    teamsHint: 'Les partenaires sont face à face. Change de place pour choisir ton équipier.',
  },

  table: {
    us: 'Nous',
    them: 'Eux',
    handNo: (n: number) => `Donne ${n}`,
    target: (n: number) => `en ${n}`,
    reserve: (n: number) => `${n} en réserve`,
    dealer: 'Donneur',
    yourTurn: 'À toi de jouer',
    waitingFor: (name: string) => `${name} réfléchit…`,
    takerLabel: (name: string) => `${name} a pris`,
    vacheLabel: 'Vache : personne n’a pris',
    contractLine: (value: number | null, trump: Trump) =>
      value === null ? trumpName(trump) : `${bidValue(value)} ${trumpName(trump)}`,
    coinched: 'Coinché',
    surcoinched: 'Surcoinché',
    tricks: (n: number) => (n > 1 ? `${n} plis` : `${n} pli`),
    take: (trump: Trump) =>
      trump === 'AT' || trump === 'SA'
        ? trumpName(trump)
        : `Prendre à ${SUIT_NAME[trump].toLowerCase()}`,
    takeTurned: 'Prendre',
    pass: 'Passer',
    bid: (value: number, trump: Trump) => `Annoncer ${bidValue(value)} ${trumpName(trump)}`,
    coinche: 'Coincher !',
    surcoinche: 'Surcoincher !',
    chooseValue: 'Contrat',
    chooseTrump: 'Atout',
    roundTwo: 'Deuxième tour : choisis une autre couleur ou passe.',
    roundOne: 'Premier tour : prendre la couleur retournée ?',
    declare: (names: string[]) => `Annoncer ${names.join(', ')}`,
    lastTrick: 'Dernier pli',
    scoreSheet: 'Feuille de score',
    rules: 'Règles',
    chat: 'Discussion',
    leave: 'Quitter la table',
    confirmLeave: 'Quitter la partie ? Un bot prendra ta place.',
    bot: 'bot',
    standingInFor: (name: string) => `remplace ${name}`,
    disconnected: 'déconnecté',
    noTrickYet: 'Aucun pli joué pour l’instant.',
    timeLeft: (s: number) => `${s} s`,
    belote: 'Belote !',
    rebelote: 'Rebelote !',
  },

  bidBubble: (bid: BidEvent): string => {
    switch (bid.type) {
      case 'pass':
        return 'Passe'
      case 'take':
        return trumpName(bid.trump)
      case 'bid':
        return `${bidValue(bid.value)} ${trumpName(bid.trump)}`
      case 'coinche':
        return 'Coinche !'
      case 'surcoinche':
        return 'Surcoinche !'
    }
  },

  result: {
    made: 'Contrat rempli !',
    theyMade: 'Ils ont rempli leur contrat',
    theyFailed: 'Ils sont dedans !',
    failed: 'Dedans...',
    vache: 'Vache',
    litige: 'Litige : les points du preneur sont mis en réserve',
    redeal: 'Tout le monde a passé : on redistribue.',
    capot: 'Capot !',
    cards: 'Cartes et dix de der',
    declarations: 'Annonces',
    belote: 'Belote',
    total: 'Marqué',
    next: 'Donne suivante',
    nextIn: (s: number) => `Donne suivante dans ${s} s`,
  },

  over: {
    weWon: 'Victoire !',
    weLost: 'Défaite',
    winners: (a: string, b: string) => `${a} et ${b} remportent la partie`,
    again: 'Nouvelle partie',
    waitHost: 'L’hôte peut relancer une partie.',
    hands: (n: number) => (n > 1 ? `${n} donnes` : `${n} donne`),
  },

  sheet: {
    title: 'Feuille de score',
    hand: '#',
    contract: 'Contrat',
    empty: 'Aucune donne terminée.',
    close: 'Fermer',
  },

  rulesInPlay: {
    title: 'Règles de cette table',
    on: 'oui',
    off: 'non',
  },

  chat: {
    placeholder: 'Écrire un message…',
    send: 'Envoyer',
    title: 'Discussion',
    label: 'Discussion et journal de la table',
    messageLabel: 'Écrire à la table',
    collapse: 'Replier la discussion',
    you: 'Toi',
  },

  voice: {
    label: 'Vocal',
    join: 'Rejoindre le vocal',
    joining: 'Connexion…',
    leave: 'Quitter le vocal',
    mute: 'Couper mon micro',
    unmute: 'Réactiver mon micro',
    alone: 'Personne d’autre n’est dans le vocal pour l’instant.',
    noMicrophone: 'Micro inaccessible. Tu peux autoriser le micro dans ton navigateur.',
    peerMuted: (name: string) => `${name} a coupé son micro`,
    unavailableWith: (name: string) => `Vocal indisponible avec ${name}`,
    muteThem: (name: string) => `Couper le son de ${name}`,
    unmuteThem: (name: string) => `Réactiver le son de ${name}`,
  },

  dismissToast: (title: string) => `Fermer : ${title}`,

  event: (e: GameEvent, name: (seat: number) => string): string | null => {
    switch (e.type) {
      case 'handStarted':
        return `Donne ${e.number}, ${name(e.dealer)} distribue.`
      case 'bid':
        return `${name(e.bid.seat)} : ${fr.bidBubble(e.bid)}`
      case 'declared':
        return `${name(e.seat)} annonce ${e.kinds.map((k) => DECL[k].toLowerCase()).join(', ')}`
      case 'belote':
        return `${name(e.seat)} : ${e.call === 'belote' ? 'Belote !' : 'Rebelote !'}`
      case 'trickWon':
        return `${name(e.seat)} remporte le pli (${e.points} pts)`
      case 'redeal':
        return 'Tout le monde passe, on redistribue.'
      case 'handEnded':
        return `Fin de la donne : ${e.result.scored[0]} à ${e.result.scored[1]}`
      case 'gameEnded':
        return 'Partie terminée !'
      case 'turnTimedOut':
        return `${name(e.seat)} a dépassé le temps, la carte est jouée pour lui.`
      case 'botTookOver':
        return `Un bot prend la place de ${name(e.seat)}.`
      case 'seatDisconnected':
        return `${name(e.seat)} s’est déconnecté.`
      case 'seatReconnected':
        return `${name(e.seat)} est de retour.`
      case 'seatLeft':
        return `${name(e.seat)} a quitté la table.`
      case 'gameRestarted':
        return 'Nouvelle partie !'
      default:
        return null
    }
  },

  error: {
    room_not_found: 'Cette table n’existe pas (ou plus).',
    room_full: 'La table est complète.',
    invalid_payload: 'Requête invalide.',
    not_host: 'Seul l’hôte peut faire ça.',
    seats_not_filled: 'Il faut quatre joueurs (ou bots) pour commencer.',
    seat_taken: 'Cette place est prise.',
    game_already_started: 'La partie a déjà commencé.',
    game_not_started: 'La partie n’a pas commencé.',
    illegal_move: 'Coup impossible.',
    not_your_turn: 'Ce n’est pas ton tour.',
    rate_limited: 'Doucement ! Réessaie dans un instant.',
    invalid_session: 'Session expirée.',
    server_full: 'Le serveur est plein, réessaie plus tard.',
    hand_in_progress: 'La donne n’est pas terminée.',
    game_over: 'La partie est terminée.',
    voice_not_joined: 'Tu n’es pas dans le salon vocal.',
    voice_peer_unavailable: 'Ce joueur n’est pas joignable en vocal.',
  } satisfies Record<ErrorCode, string>,

  crash: {
    title: 'Oups, la table a glissé.',
    seatHeld: 'Ta place est gardée : recharge la page pour reprendre la partie.',
    reload: 'Recharger',
  },
}
