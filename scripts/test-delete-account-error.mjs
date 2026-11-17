import { readFileSync } from 'node:fs'
import { friendlyDeleteError, DELETE_FALLBACK } from '../src/lib/deleteAccountError.js'
let fails = 0
const ok = (name, cond) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`) }
const COPY = "Couldn't delete your account. Try again, or email machinemisha@gmail.com."
ok('the copy is exactly the approved sentence', DELETE_FALLBACK === COPY)
// The report that started this: the raw database error
ok('raw FK error is replaced', friendlyDeleteError('insert or update on table "user_stats" violates foreign key constraint "user_stats_user_id_fkey"') === COPY)
ok('other SQL and server messages are replaced', ['column "x" of relation "bookings" does not exist', 'duplicate key value violates unique constraint', 'permission denied for function public.delete_account', "Owner accounts can't be deleted from the app.", 'Something went wrong.'].every(m => friendlyDeleteError(m) === COPY))
ok('empty or missing message gives the same sentence', friendlyDeleteError(undefined) === COPY && friendlyDeleteError('') === COPY && friendlyDeleteError(null) === COPY)
// The screen and the Edge Function use it
const view = readFileSync(new URL('../src/screens/profile/DeleteAccountView.jsx', import.meta.url), 'utf8')
ok('the screen shows friendlyDeleteError and no other failure text', /setError\(friendlyDeleteError\(/.test(view) && !/Nothing was deleted/.test(view))
const fn = readFileSync(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8')
ok('the Edge Function sends the same sentence for every failure', fn.includes("const FRIENDLY = 'Couldn\\'t delete your account. Try again, or email machinemisha@gmail.com.'") && !/Something went wrong/.test(fn) && !/error\.message \}/.test(fn))
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0)
