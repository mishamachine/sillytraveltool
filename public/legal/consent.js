/* Usage-stats question for the static pages (help, privacy, terms, delete-account). Same rules as src/lib/consent.js:
   visitors in the EU, EEA, UK or Switzerland start with usage stats off and are asked once; the answer is stored under
   the same localStorage key the app reads. These pages load no analytics themselves. Accept and Reject are the same
   size and weight; ignoring the banner never counts as a yes. A footer link ([data-consent-settings]) reopens it. */
(function () {
  var KEY = 'stt_analytics'
  var COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH']
  var NON_ZONES = ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Kirov', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Simferopol', 'Europe/Minsk', 'Europe/Istanbul']
  var EXTRA_ZONES = ['Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Africa/Ceuta', 'Atlantic/Reykjavik']

  function langRegion(tag) {
    var m = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?:[-_]|$)/i.exec(String(tag || ''))
    return m ? m[1].toUpperCase() : null
  }
  function inRegion() {
    var tz = ''
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch (e) {}
    if (EXTRA_ZONES.indexOf(tz) > -1) return true
    if (tz.indexOf('Europe/') === 0 && NON_ZONES.indexOf(tz) === -1) return true
    var langs = []
    try { langs = Array.prototype.slice.call(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) } catch (e) {}
    return langs.some(function (l) { return COUNTRIES.indexOf(langRegion(l)) > -1 })
  }
  function pref() {
    try { var v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : null } catch (e) { return null }
  }
  function save(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch (e) {}
  }

  var box
  function close() { if (box) { box.remove(); box = null } }
  function open() {
    if (box) return
    var css = document.createElement('style')
    css.textContent = '.stt-consent{position:fixed;z-index:1000;top:12px;left:12px;right:12px;max-width:420px;margin:0 auto;padding:16px;border-radius:22px;background:var(--card);color:var(--ink);border:1px solid var(--line);box-shadow:0 8px 22px rgba(120,80,50,.18);font:400 15px/1.45 "DM Sans",system-ui,sans-serif}' +
      '.stt-consent p{margin:0 0 6px;color:var(--ink-2);font-size:14px}.stt-consent p.t{color:var(--ink);font-weight:700;font-size:16px}' +
      '.stt-consent div{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}' +
      '.stt-consent button{min-height:48px;border-radius:16px;border:2px solid var(--accent);background:transparent;color:var(--accent);font:600 15px "DM Sans",system-ui,sans-serif;cursor:pointer}' +
      '.stt-consent button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}'
    box = document.createElement('aside')
    box.className = 'stt-consent'
    box.setAttribute('role', 'region')
    box.setAttribute('aria-label', 'Usage stats')
    box.innerHTML = '<p class="t">Help us improve Silly Travel Tool with anonymous usage stats?</p>' +
      '<p>Nothing is sent unless you accept. No names, emails or trip details. See our <a href="/privacy/">Privacy Policy</a>.</p>' +
      '<div><button type="button" data-a="1">Accept</button><button type="button" data-a="0">Reject</button></div>'
    box.appendChild(css)
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-a]')
      if (!b) return
      save(b.getAttribute('data-a') === '1')
      close()
    })
    document.body.appendChild(box)
  }

  function init() {
    if (inRegion() && pref() === null) open()
    var links = document.querySelectorAll('[data-consent-settings]')
    for (var i = 0; i < links.length; i++) links[i].addEventListener('click', function (e) { e.preventDefault(); open() })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
