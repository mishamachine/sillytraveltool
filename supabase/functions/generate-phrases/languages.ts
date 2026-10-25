// The languages the Translate tool can ask for (audit S3). The display name that goes into the prompt and into
// phrase_cache (kept forever, shown to everyone) is derived here from the code, never taken from the request.
// Keep in step with ALL_LANGUAGES and COUNTRY_TO_LANGUAGE in src/screens/toolbox/components/TranslateTool.jsx.

// The 35 in the picker
export const PICKER_LANGUAGES: Record<string, string> = {
  ar: 'Arabic', zh: 'Chinese (Mandarin)', cs: 'Czech', da: 'Danish', nl: 'Dutch', fi: 'Finnish', fr: 'French',
  de: 'German', el: 'Greek', hi: 'Hindi', hu: 'Hungarian', id: 'Indonesian', it: 'Italian', ja: 'Japanese',
  ko: 'Korean', ms: 'Malay', no: 'Norwegian', fa: 'Persian', pl: 'Polish', pt: 'Portuguese', ro: 'Romanian',
  ru: 'Russian', sr: 'Serbian', es: 'Spanish', sv: 'Swedish', tl: 'Tagalog', th: 'Thai', tr: 'Turkish',
  uk: 'Ukrainian', vi: 'Vietnamese', bn: 'Bengali', hr: 'Croatian', is: 'Icelandic', ta: 'Tamil', ur: 'Urdu',
}

// Picked automatically from a trip's country (COUNTRY_TO_LANGUAGE) though not in the picker
const COUNTRY_ONLY: Record<string, string> = {
  he: 'Hebrew', am: 'Amharic', yo: 'Yoruba', af: 'Afrikaans', bg: 'Bulgarian', sk: 'Slovak', sl: 'Slovenian',
}

/** Languages phrases can be written in. */
export const TARGET_LANGUAGES: Record<string, string> = { ...PICKER_LANGUAGES, ...COUNTRY_ONLY }
/** The traveller's own language: English or any picker language. */
export const SOURCE_LANGUAGES: Record<string, string> = { en: 'English', ...PICKER_LANGUAGES }

const pick = (table: Record<string, string>, code: unknown) => {
  const c = typeof code === 'string' ? code.trim().toLowerCase() : ''
  return Object.hasOwn(table, c) ? { code: c, name: table[c] } : null
}

/** { code, name } for a supported target code, else null. */
export const targetLanguage = (code: unknown) => pick(TARGET_LANGUAGES, code)
/** { code, name } for a supported source code; missing means English, anything else unknown is null. */
export const sourceLanguage = (code: unknown) => (code == null || code === '' ? { code: 'en', name: 'English' } : pick(SOURCE_LANGUAGES, code))
