/**
 * Quote a value for use inside a PostgREST filter string (e.g. `.or()`).
 * Wraps in double quotes and escapes backslashes and double quotes, so
 * commas, dots, parentheses etc. in the value can't alter the filter.
 */
export function pgQuote(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
