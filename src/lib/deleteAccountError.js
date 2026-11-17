// What the member sees when account deletion fails: always the same plain sentence, never a server or database
// message. (The Edge Function sends the same text; this is the second wall, and covers older function versions.)
export const DELETE_FALLBACK = "Couldn't delete your account. Try again, or email machinemisha@gmail.com and we'll delete it for you."

export function friendlyDeleteError() {
  return DELETE_FALLBACK
}
