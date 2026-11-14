// Moving bookings between trips: what the server actually saved decides what the app shows.
// PostgREST answers an RLS-denied update with no error and zero rows, so "no error" is not "moved".

export const CANT_MOVE_COPY = "You can't move bookings into that trip"

/** Split the requested bookings by the rows the update returned (`.select('id')`). */
export function splitMoved(bookings, updatedRows) {
  const saved = new Set((updatedRows || []).map(r => r.id))
  return {
    moved: bookings.filter(b => saved.has(b.id)),
    refused: bookings.filter(b => !saved.has(b.id)),
  }
}

/** Plain words for a move that did not fully happen, or null when all of it did. */
export function moveMessage(moved, refused) {
  if (!refused) return null
  if (!moved) return CANT_MOVE_COPY
  const of = moved + refused
  return `Moved ${moved} of ${of} bookings. ${refused === 1 ? '1 booking' : `${refused} bookings`} couldn't be moved into that trip and ${refused === 1 ? 'stays' : 'stay'} where ${refused === 1 ? 'it was' : 'they were'}.`
}
