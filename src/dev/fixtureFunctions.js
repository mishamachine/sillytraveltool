// Demo-mode Edge Function responses, keyed by function name. Each receives the request body.
import guide from './fixtures/guide'
import honk from './fixtures/honk'
import checklist from './fixtures/checklist'
import phrases from './fixtures/phrases'
import parse from './fixtures/parse'

export const DEMO_FUNCTIONS = {
  'generate-guide': guide,
  'goosey-discover': honk,
  'generate-checklist': checklist,
  'generate-phrases': phrases,
  'parse-booking-email': parse,
}
