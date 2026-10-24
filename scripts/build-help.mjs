#!/usr/bin/env node
// Writes public/help/index.html (sillytraveltool.com/help) from src/lib/helpContent.js, the same content as the
// in-app Help screen. Runs before every `npm run build`; commit the output so dev and native builds have it too.
import { mkdirSync, writeFileSync } from 'node:fs'
import { HELP_GROUPS, HELP_TOPICS, HELP_FAQ, HELP_CONTACT } from '../src/lib/helpContent.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const today = new Date().toISOString().slice(0, 10)

const topic = (t) => `
  <section class="card topic" id="${t.id}">
    <h3>${esc(t.title)}</h3>
    <p class="lede">${esc(t.summary)}</p>
    <ol>${t.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${t.tips?.length ? `<div class="tip"><strong>Good to know</strong>${t.tips.map(s => `<p>${esc(s)}</p>`).join('')}</div>` : ''}
  </section>`

const faqLd = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: HELP_FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>How to use Silly Travel Tool — Help</title>
  <meta name="description" content="Short guides to Silly Travel Tool: start a trip, forward booking emails to Goose, city guides, HONK, sharing trips and travel tools." />
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
  <p class="meta">Short guides to every part of the app · Updated ${today}</p>

  <div class="card summary">
    <p><strong>The short version.</strong> Start a trip, forward your booking emails to your Goose inbox, and Goose files
    them into the right trip with local times. Explore the city guide or ask HONK for something good nearby, save ideas in
    one tap, and keep currency, phrases and SOS numbers in your pocket.</p>
  </div>

  <ul class="toc">${HELP_GROUPS.map(g => `<li><a href="#${g.id}">${esc(g.title)}</a></li>`).join('')}<li><a href="#questions">Questions</a></li></ul>
${HELP_GROUPS.map(g => `
  <h2 id="${g.id}">${esc(g.title)}</h2>${HELP_TOPICS.filter(t => t.group === g.id).map(topic).join('')}`).join('\n')}

  <h2 id="questions">Questions</h2>
  <div class="card">${HELP_FAQ.map(f => `
    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
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
console.log(`help page written: public/help/index.html (${HELP_TOPICS.length} topics, ${HELP_FAQ.length} questions)`)
