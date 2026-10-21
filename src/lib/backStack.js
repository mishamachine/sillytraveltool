// One stack for "go back" handlers: open sheets/dialogs and sub-views (a tool, a recap, a guide
// section, the trip overlay) register here. Android's back button and Escape close only the top one.
import { useEffect, useRef } from 'react'

const stack = []

/** Registers a handler; returns { remove, isTop }. */
export function pushBack(handler) {
  const entry = { handler }
  stack.push(entry)
  return {
    remove: () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1) },
    isTop: () => stack[stack.length - 1] === entry,
  }
}

/** Runs the top handler. Returns false when nothing was open. */
export function goBack() {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.handler()
  return true
}

/** While `active`, the hardware back button (and Escape in sheets) calls `onBack`. */
export function useBackHandler(active, onBack) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    const { remove } = pushBack(() => ref.current?.())
    return remove
  }, [active])
}
