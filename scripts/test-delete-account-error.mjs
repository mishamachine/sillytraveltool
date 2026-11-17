import { friendlyDeleteError, DELETE_FALLBACK } from '../src/lib/deleteAccountError.js'
let fails = 0
const ok = (name, cond) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`) }
// The report that started this: the raw database error
ok('raw FK error is replaced', friendlyDeleteError('insert or update on table "user_stats" violates foreign key constraint "user_stats_user_id_fkey"') === DELETE_FALLBACK)
ok('other SQL errors are replaced', friendlyDeleteError('column "x" of relation "bookings" does not exist') === DELETE_FALLBACK
  && friendlyDeleteError('duplicate key value violates unique constraint "api_usage_pkey"') === DELETE_FALLBACK
  && friendlyDeleteError('permission denied for function public.delete_account') === DELETE_FALLBACK)
ok('empty or missing message falls back', friendlyDeleteError(undefined) === DELETE_FALLBACK && friendlyDeleteError('') === DELETE_FALLBACK && friendlyDeleteError(null) === DELETE_FALLBACK)
ok('very long message falls back', friendlyDeleteError('x'.repeat(200)) === DELETE_FALLBACK)
ok('deliberate messages pass through', friendlyDeleteError('Owner accounts can\'t be deleted from the app.') === 'Owner accounts can\'t be deleted from the app.'
  && friendlyDeleteError('Type DELETE to confirm.') === 'Type DELETE to confirm.')
ok('fallback names nothing technical and says nothing was deleted', !/constraint|sql|user_stats/i.test(DELETE_FALLBACK) && /Nothing was deleted/.test(DELETE_FALLBACK))
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0)
