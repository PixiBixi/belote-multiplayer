import type { SeatInfo } from '@belote/protocol'

export type Side = 'bottom' | 'right' | 'top' | 'left'

/** Play goes counter-clockwise: the next seat sits on your right. */
export function sideOf(seat: number, mySeat: number): Side {
  const rel = (seat - mySeat + 4) % 4
  return (['bottom', 'right', 'top', 'left'] as const)[rel] ?? 'bottom'
}

export function seatName(seats: readonly SeatInfo[], seat: number): string {
  const info = seats.find((s) => s.seat === seat)
  return info && info.kind !== 'empty' ? info.name : `#${seat + 1}`
}

/** Team of a seat, from the point of view of `mySeat`: 'us' or 'them'. */
export const sideTeam = (seat: number, mySeat: number): 'us' | 'them' =>
  seat % 2 === mySeat % 2 ? 'us' : 'them'
