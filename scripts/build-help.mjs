#!/usr/bin/env node
// Writes public/help/index.html (sillytraveltool.com/help) from src/lib/helpContent.js, the same content as the
// in-app Help screen. Runs before every `npm run build`; commit the output so dev and native builds have it too.
import { mkdirSync, writeFileSync } from 'node:fs'
import { HELP_GROUPS, HELP_TOPICS, HELP_FAQ, HELP_CONTACT } from '../src/lib/helpContent.js'

// The public page describes only features that are live today. The in-app Help (same data file) is untouched.
const HIDE_GROUPS = []
const HIDE_TOPICS = ['together-bookings', 'ideas', 'get-there']
const TOPIC_OVERRIDES = {
  share: {
    steps: [
      'Open the trip and tap the Travelers button at the top (or Trip options → Invite travelers).',
      'Type their email under Invite by email, choose Can edit or View only, and tap Send invite.',
      'Goose emails them an invite. They sign in (or create a free account) and tap Join trip under Invites on their Trips screen.',
    ],
    tips: [
      'Someone who accepts can see the whole shared trip, including its booking details, activities and dates. They never see your travel documents or loyalty cards.',
      'View only stops edits, not viewing: it keeps the plan safe from accidental changes, but a View only traveller can still see the trip.',
      'If the trip owner deletes their account, the trip is deleted for everyone.',
    ],
  },
  'together-live': {
    summary: 'While a trip is open, changes from other travellers appear without a refresh.',
    steps: [
      'Keep the trip open: new bookings and plans appear on their own.',
      'Times are shown in the local time where they happen, so arrivals line up even across time zones.',
      'Add a plan like "Meet at the hotel, 16:30" so everyone knows where to be.',
    ],
  },
  guide: {
    steps: [
      'Open Explore. Your next trip\'s city loads on its own, or search any city.',
      'Pick a section: Know (history and local quirks), Eat (cheap to splurge), See, Transit or Events.',
      'Tap Show 15 more for the next batch of places.',
    ],
  },
  honk: {
    tips: ['Moods include I\'m hungry, Treat myself, On a budget, Culture me and Night out.', 'Your location is sent to Google to find nearby places. See the Privacy Policy.'],
    summary: 'Pick a mood and get nearby place picks.',
    steps: [
      'Open Explore and tap a mood on the HONK card, or More moods.',
      'Your browser asks to share your location. HONK uses it only when you allow it. If you would rather not, choose a city yourself.',
      'Goose picks a place and shows its walking time. Not feeling it? Tap Another spot.',
    ],
  },
  score: { tips: ['Your score and badges are personal: they are private to you.'] },
  'new-trip': { tips: [
    'A trip without dates shows "Planning". Tap Add dates whenever you decide; adding a booking fills them in for you.',
    'Visiting several cities? Keep one trip and add a stay in each city. Weather follows you city by city.',
  ] },
  'goose-inbox': {
    summary: 'A quick way in. Goose reads the email and files it into the right trip.',
    steps: [
      'Find your private Goose inbox address in Profile → Settings → Goose inbox, and tap Copy.',
      'Forward any flight, hotel, train, restaurant or ticket confirmation to it.',
      'It shows up in the matching trip. No trip for that city yet? Goose starts one.',
    ],
  },
  paste: {
    steps: [
      'Open a trip, tap + and choose Paste confirmation text.',
      'Paste the text and tap Read it. Goose pulls out times, places and confirmation numbers.',
      'Check the details, pick the trip (or New trip) and save.',
    ],
    tips: [],
  },
  'by-hand': { tips: ['Times are always the local time where the thing happens, not your phone\'s time. A 09:00 flight from Tokyo stays 09:00, wherever you are.'] },
  'trip-tabs': {
    steps: [
      'Plan: everything booked, day by day, plus your trip ideas.',
      'Weather: the forecast for each day, for the city you\'re in that night.',
      'Pack: a packing list made for this trip, its weather and what you\'ve booked. Tick things off as you go. The list is kept on this device.',
    ],
  },
  tools: {
    steps: [
      'Currency: live rates between the local currency and your home currency.',
      'Translate: a pocket phrase book in the local language, plus a box to translate anything you type.',
      'Tip & split: each person\'s share of the bill.',
      'SOS: emergency numbers and an emergency card for the country you\'re in.',
    ],
    tips: ['Numbers can change or be wrong; in an emergency follow local authorities.', 'Phrase books you\'ve loaded and typed translations are kept on your device.'],
  },
  wallet: {
    tips: ['Your documents and loyalty cards are private to you. They are not shown to people you share a trip with.'],
  },
  settings: { steps: ['Open Profile → Settings.', 'Turn off Share usage stats to stop anonymous feature counts from this device.',
    'Delete account erases your trips and documents (payment records are kept as the law requires). Bookings you added to someone else\'s trip stay on that trip.'] },
}
const HIDE_FAQ = ['Can my friends forward their own bookings to the trip?', 'How do I replay the tour?']
const FAQ_OVERRIDES = {
  'Does it work offline?': 'Phrase books you\'ve loaded and typed translations are kept on your device. Guides, imports and live rates need a connection, so screenshot SOS and your hotel address before you fly.',
  'Who can see my trips?': 'Your trips are private to you unless you invite someone. Goose\'s AI processors read forwarded emails to pull out booking details; we keep the booking details. See the Privacy Policy.',
}
const GROUPS = HELP_GROUPS.filter(g => !HIDE_GROUPS.includes(g.id))
const TOPICS = HELP_TOPICS.filter(t => !HIDE_TOPICS.includes(t.id) && !HIDE_GROUPS.includes(t.group)).map(t => ({ ...t, ...TOPIC_OVERRIDES[t.id] }))
const FAQ = HELP_FAQ.filter(f => !HIDE_FAQ.includes(f.q)).map(f => FAQ_OVERRIDES[f.q] ? { ...f, a: FAQ_OVERRIDES[f.q] } : f)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rich = (s) => esc(s).replace('Privacy Policy', '<a href="/privacy/">Privacy Policy</a>')
const today = new Date().toISOString().slice(0, 10)

const topic = (t) => `
  <section class="card topic" id="${t.id}">
    <h3>${esc(t.title)}</h3>
    <p class="lede">${esc(t.summary)}</p>
    <ol>${t.steps.map(s => `<li>${rich(s)}</li>`).join('')}</ol>
    ${t.tips?.length ? `<div class="tip"><strong>Good to know</strong>${t.tips.map(s => `<p>${rich(s)}</p>`).join('')}</div>` : ''}
  </section>`

const faqLd = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>How to use Silly Travel Tool — Help</title>
  <meta name="description" content="Short guides to Silly Travel Tool: start a trip, forward booking emails to Goose, share trips, use city guides and HONK, check the weather, and use currency, translate and SOS tools." />
  <meta name="theme-color" content="#F4EEE6" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="canonical" href="https://sillytraveltool.com/help/" />
  <meta property="og:title" content="How to use Silly Travel Tool" />
  <meta property="og:image" content="https://sillytraveltool.com/og-image.png" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:wght@400;600&display=swap" />
  <link rel="stylesheet" href="/legal/legal.css" />
  <style>
    .toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; padding: 0; list-style: none; }
    .toc a { display: inline-flex; min-height: 44px; align-items: center; padding: 0 14px; border-radius: 14px; background: var(--card); text-decoration: none; font-size: 14px; }
    .topic h3 { font: 700 19px/1.3 'Space Grotesk', system-ui, sans-serif; margin: 4px 0 4px; color: var(--ink); }
    .topic .lede { margin: 0 0 8px; }
    .topic ol { margin: 0 0 8px; padding-left: 22px; }
    .topic li { margin: 4px 0; }
    .tip { background: var(--soft); border-radius: 14px; padding: 10px 14px; font-size: 15px; }
    .tip p { margin: 4px 0 0; }
    details { border-bottom: 1px solid var(--line); padding: 12px 0; }
    summary { cursor: pointer; font-weight: 600; color: var(--ink); min-height: 28px; }
    details p { margin: 8px 0 0; }
  </style>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head>
<body>
<main>
  <header>
    <a class="brand" href="/"><img src="/favicon.svg" alt="" width="32" height="32" />Silly Travel Tool</a>
    <a class="back" href="/">Open the app</a>
  </header>

  <h1>How to use Silly Travel Tool</h1>
  <p class="meta">Short guides to Silly Travel Tool · Updated ${today}</p>

  <div class="card summary">
    <p><strong>The short version.</strong> Start a trip, forward your booking emails to your Goose inbox, and Goose files
    them into the right trip with local times. Invite people to a shared trip, check the weather for your dates, explore the
    city guide or ask HONK for nearby picks, and keep currency, phrases and SOS numbers in your pocket.</p>
  </div>

  <ul class="toc">${GROUPS.map(g => `<li><a href="#${g.id}">${esc(g.title)}</a></li>`).join('')}<li><a href="#questions">Questions</a></li></ul>
${GROUPS.map(g => `
  <h2 id="${g.id}">${esc(g.title)}</h2>${TOPICS.filter(t => t.group === g.id).map(topic).join('')}`).join('\n')}

  <h2 id="questions">Questions</h2>
  <div class="card">${FAQ.map(f => `
    <details><summary>${esc(f.q)}</summary><p>${rich(f.a)}</p></details>`).join('')}
  </div>

  <footer>
    Still stuck? Email <a href="mailto:${HELP_CONTACT}">${HELP_CONTACT}</a>. ·
    <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a>
  </footer>
</main>
</body>
</html>
`

const out = new URL('../public/help/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('index.html', out), html)
console.log(`help page written: public/help/index.html (${TOPICS.length} topics, ${FAQ.length} questions)`)
