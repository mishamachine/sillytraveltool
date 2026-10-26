# STT legal review (2026-10-25)

> **Not legal advice.** I am Claude, an AI model, not a licensed attorney, and nothing here creates an attorney-client
> relationship. This is a practical issue-spotting review and action plan written so that a real attorney (and, for
> tax, a CPA) can confirm or correct it quickly. Laws and platform rules below were checked on 2026-10-25; the fee and
> threshold figures change, so re-check them before you pay or file anything.

Scope: Silly Travel Tool (STT), sillytraveltool.com, the iOS beta (TestFlight review) and Android beta (Play verification
pending), as of `main` at `4ff50e4`. Read: `public/privacy/`, `public/terms/`, `public/delete-account/`, the audit report
(`docs/audit-pack/09_FABLE_AUDIT_REPORT.md`, outside git), `docs/STORE_PRIVACY_FORMS.md`, `docs/PAYWALL_PLAN.md`,
`docs/STRIPE_BILLING.md`, `docs/HANDOFF.md`, `video/posting/POSTING_PACK.md`, `video/generated/campaign-plan.md`
(outside git), `docs/audit-pack/04_GROWTH_SOCIAL_MARKETING.md`, `docs/brand/BRAND.md`, and the relevant code
(`src/lib/ga.js`, `src/lib/sentry.js`, `PaywallSheet.jsx`, `upgrade/main.jsx`, `DocumentsView.jsx`, `_shared/gemini.ts`,
`_shared/emailTemplate.js`, `places`, `generate-guide`). Nothing was filed, paid, submitted or changed in the app.

The companion document is [`IP_PROTECTION_PLAN.md`](IP_PROTECTION_PLAN.md) (trademarks, copyright, trade secrets).

> **Owner decision, 2026-10-26 (L1/L2):** DeepSeek stays the AI for everything, including booking emails, pastes and
> typed translations. L2 (moving personal data to Gemini) is declined. L1 is built with a clear, separate
> "DeepSeek, China" Allow step in onboarding (asked again at the first import if skipped), and the privacy page says
> plainly that the transfer to China relies on the member's explicit consent, without contractual safeguards. The owner
> accepts the remaining EU/UK GDPR risk (R1 stays High for EU/UK members; Apple 5.1.2(i) is met by the Allow step).

---

## Top five actions (do these first)

| # | Action | Why it matters | Cost | Time | Who |
|---|---|---|---|---|---|
| 1 | **Ask before AI reads personal data, and stop sending personal data to DeepSeek** (L1, L2): a one-time consent sheet before the first email/paste/file import, and route booking emails, files and documents to Gemini on a paid Google plan; keep DeepSeek for requests with no personal data (city guides, packing lists, phrases) | Apple rejects apps that send personal data to third-party AI without explicit permission (guideline 5.1.2(i)); EU/UK law has no lawful route for booking emails to China today; the policy's "contractual safeguards" line is probably untrue for DeepSeek | $0 (Gemini usage: cents a day) | 1 to 2 days | Owner approves; Claude builds; owner confirms Google AI billing is on |
| 2 | **Washington health-data policy for vaccine records** (L5): a separate "Consumer Health Data Privacy Policy" page, a link on the homepage, and a consent line when a member adds a vaccine record | STT is based in Washington and stores vaccine records; Washington's My Health My Data Act applies to businesses of any size and lets consumers sue | $0 to draft; $300 to $600 attorney check | 1 day | Claude drafts; attorney reviews; owner approves |
| 3 | **Fix the tax position on web sales** (L19, L20): register with the Washington Department of Revenue, collect Washington sales tax on web sales to Washington buyers (Stripe Tax for WA), and decide what to do about EU/UK web buyers (VAT is due from the first sale) | "Threshold monitoring only" covers other US states, but you have nexus in your home state from the first sale, and the EU and UK give non-resident sellers of digital services no threshold | Business license about $50 to $90; Stripe Tax 0.5% per taxed sale; CPA $200 to $500 | 1 to 2 weeks | Owner and a CPA |
| 4 | **Form an LLC with a distinct name, and get the home address off every page and email** (L25 to L29, L3) | Today you trade personally: any claim reaches your house and savings, and the home address is on the privacy page, terms page and in the footer of every email. "Bodhi Studios" is already used by a "Bodhi Studios, LLC" App Store seller and by bodhistudios.com (an app developer site) | LLC $200 + registered agent $50 to $150/yr + mailbox $100 to $300/yr | 1 to 3 weeks (D-U-N-S up to 30 days) | Owner; Claude updates pages and emails |
| 5 | **Re-cut the AI-traveller ads before they run** (L30 to L32): a visible "Fictional traveller · AI-generated" label on screen for the whole video (not a 1-second end card), the same words in the caption, platform AI labels on | The FTC's 2024 rule bans testimonials from people who don't exist unless the ad makes clear they aren't real customers; penalties are about $53,000 per violation. EU AI Act transparency rules (deepfakes) have applied since 2026-08-02 | $0 | 1 day | Claude re-renders; owner posts |

Ratings: **High** = could stop a store launch, cost real money, or expose you personally now; **Medium** = fix before
meaningful scale (hundreds of paying members or paid ads); **Low** = tidy-up. "Who": **Owner**, **Claude** (code or copy,
after your go-ahead), **Attorney**, **CPA**.

---

## Risk register (ranked)

| ID | Rating | Risk | Fix (action numbers below) | Who |
|---|---|---|---|---|
| R1 | High | Personal data (booking emails, files, pasted text) goes to DeepSeek in China; no consent screen; no valid GDPR transfer route; privacy policy claims contractual safeguards that probably don't exist | L1, L2, L8 | Claude, Owner |
| R2 | High | Vaccine records in the wallet are "consumer health data" under Washington's My Health My Data Act (MHMDA); no separate policy or homepage link | L5 | Claude, Attorney |
| R3 | High | Sales tax: Washington tax on web sales to WA buyers is likely due now; EU/UK VAT on web sales is due from the first sale | L19, L20, L21 | Owner, CPA |
| R4 | High | Personal liability and exposure: sole proprietor, home address published, Apple seller is your legal name; "Bodhi Studios" is used by others | L25 to L29, L3 | Owner |
| R5 | High | AI fictional-traveller ads: disclosure only on a 1-second end card; first-person "I" voice-overs by people who don't exist | L30 to L33 | Claude, Owner |
| R6 | Medium | Policy and terms say things that are no longer, or never were, true (in-app deletion "coming", crash reports "no personal data", raw emails not kept, deletion erases "everything else") | L3, L4, L6, L7 | Claude |
| R7 | Medium | Website loads Google Analytics before consent for EU/UK visitors | L10 | Claude |
| R8 | Medium | No EU or UK representative (GDPR Art. 27); no data processing agreements on file | L8, L9 | Owner |
| R9 | Medium | Auto-renew rules: California needs express consent with a record and a renewal reminder before each yearly renewal; EU needs an online "withdraw from contract" button since 2026-06-19 | L15, L16, L17 | Claude, Owner |
| R10 | Medium | "Lifetime" copy says "yours for good" and "for good"; the terms say "as long as we run STT". The promise needs to match, plus a shutdown and sale plan | L18 | Claude, Owner |
| R11 | Medium | The past-trip lock depends on a free "Download my data" export that doesn't exist yet | L14 | Claude |
| R12 | Medium | Personal Google Play account must run a 12-tester, 14-day closed test before production; an organisation account is exempt | L23, L27 | Owner |
| R13 | Medium | No insurance and no written incident plan | L35, L36 | Owner |
| R14 | Low | Terms lack a liability cap, venue, beta clause, Apple EULA line, AI-output clause | L13 | Claude, Attorney |
| R15 | Low | Email marketing: home address in footer, 13 "consent unknown" former members | L3, L11 | Claude |
| R16 | Low | Ad footage may show Google Places photos or third-party logos; music licensing on business accounts | L33, L34 | Owner |
| R17 | Low | No age confirmation at sign-up; no open-source notices screen | L12, L37 | Claude |

---

## 1. Terms and privacy versus reality

What the pages say, checked against what the code and the audit show.

| # | Page says | Reality | Gap | Fix |
|---|---|---|---|---|
| 1.1 | Operator "Babar Ali, 402 Grandey Way NE, Renton, WA 98056" (privacy, terms, delete-account page, every email footer in `_shared/emailTemplate.js`) | Correct today, but it is your home | Safety and privacy; ties every claim to you personally | L3 (mailbox), L25 (LLC) |
| 1.2 | "Delete account sends us a deletion request (in-app deletion is coming in a future update)" | In-app deletion is built and immediate (`/delete-account/` says "erased right away") | Stale and contradicts the delete page | L4 |
| 1.3 | DeepSeek "protected by our providers' contractual safeguards (such as the EU Standard Contractual Clauses where they apply)" | No DPA or SCCs with DeepSeek are on file; the Berlin and Italian regulators have acted against DeepSeek over transfers to China | Likely untrue; R1 | L1, L2, L8 |
| 1.4 | "We keep the extracted details, not a library of your emails or files" | STT doesn't keep them, but Resend keeps inbound emails under its own retention, and AI providers may keep requests briefly for abuse checks | Incomplete | L6 |
| 1.5 | Sentry "Technical error details, no personal data" | PR #13 strips emails and IDs and gates Sentry on Share usage stats (verified in `src/lib/sentry.js`) | Close to true; say what is stripped | L6 |
| 1.6 | Usage events go to GA "on the website and in the apps", "IP addresses anonymised" | True since PR #13; GA4 doesn't store IPs anyway | OK; but web GA starts before consent (R7) | L10 |
| 1.7 | Usage events 25 months; "When your account is deleted we erase everything else within 30 days, including backups" | Audit S7/S8: `admin_audit`, `email_sends` (addresses), `former_members`, `beta_waitlist`, `member_notes` and two backup tables aren't purged; `email_sends.email` survives deletion | Untrue for some tables | L7 (code) or soften wording |
| 1.8 | Past-trip lock (planned) with a free "Download my data" export (PAYWALL_PLAN) | No export exists (audit N4); terms promise "reasonable notice ... so you can save your information" | The legal guard for the lock is missing | L14 before the lock switches on |
| 1.9 | Refunds: "Website purchases: email us within 14 days" | `/upgrade/` copy matches; stores refund under their rules | Consistent. EU now also needs an online withdrawal function (R9) | L16 |
| 1.10 | "Lifetime means for as long as we run STT, on your account; it isn't transferable" | Paywall says "then it's yours for good"; tour says "every trip after is on us, for good" | Copy promises more than the terms | L18 |
| 1.11 | Governing law Washington; consumers keep mandatory local protections | Fine for a consumer app | Add venue and small-claims option | L13 |
| 1.12 | Processors table | Missing: Hostinger (website host, server logs with IPs), Google Fonts (the legal pages and app load fonts from Google, which sees visitor IPs), Klarna/Link if left on in Stripe Checkout (HANDOFF "Open") | Incomplete | L6; consider self-hosting fonts; turn off Klarna and Bank in Stripe or list them |
| 1.13 | Health data | Vaccine records are a wallet document type (`DocumentsView.jsx:17`) | No MHMDA policy (R2) | L5 |
| 1.14 | Children "not meant for under 13 (16 EU/UK)" | No age question at sign-up | Low risk while you don't target children; a one-line confirmation helps | L12 |

### Replacement wording (drop-in; attorney to confirm)

**Who we are** (privacy section and terms §1, once the LLC exists):
> Silly Travel Tool ("STT", "we") is operated by [Company name] LLC, a Washington limited liability company,
> [PO box or virtual business address]. Questions or requests: hello@sillytraveltool.com.

Until the LLC exists, use your name with the mailbox address (L3), not the home address.

**AI providers and your permission** (new privacy section; also the text of the in-app consent sheet in L1):
> Goose uses AI to read what you import (forwarded booking emails, pasted text, files and photos) and to write guides,
> packing lists and phrases. The first time you import something, we ask for your permission. Booking emails, files and
> documents are read by Google's Gemini API (United States) under Google's paid-service terms, which don't allow Google
> to use them to train its models. Requests without personal information, such as a city name and dates for a guide, may
> be handled by DeepSeek (China). AI providers may keep a request for a short time to detect abuse, under their own
> terms. You can withdraw permission in Settings → AI imports; imports then stop working until you turn it back on.

(Use this wording only once L2 is built. If DeepSeek stays on personal data, the honest version is: "Booking emails and
files are read by DeepSeek in China. China doesn't have an EU or UK adequacy decision and we don't have contractual
safeguards with DeepSeek, so we ask for your explicit consent to this transfer." That is weaker legally (GDPR Art.
49(1)(a) is a narrow exception) and still needs the Apple consent sheet.)

**International transfers** (replace the current paragraph):
> Our main servers are in the United States (Supabase, us-east-2). If you use STT from the EU, UK or elsewhere, your data
> is transferred to the United States under our providers' Standard Contractual Clauses or the EU-U.S. Data Privacy
> Framework where the provider is certified. [If DeepSeek kept for non-personal requests:] Requests sent to DeepSeek in
> China contain only the city, dates and booking types, not your name, email or booking details.

**Account deletion** (replace the bullet):
> Delete your account: Profile → Settings → Delete account, type DELETE and confirm. Your account is erased right away.
> If you can't sign in, email hello@sillytraveltool.com from your account address. See
> sillytraveltool.com/delete-account for what is erased and what we keep.

**Booking emails** (add to that section):
> Our email provider (Resend) keeps a copy of each forwarded email for [N] days under its own terms, then deletes it; we
> keep only the booking details Goose extracted.
(Or Claude deletes the received email through Resend's API after parsing, and the sentence becomes "we delete the email
from our email provider once Goose has read it". Check what Resend's API allows; the owner picks.)

**Crash reports** (processor row):
> Sentry (United States) · Crash reports · Technical error details with email addresses, account IDs and booking
> numbers removed; sent only while Share usage stats is on.

**Lifetime** (terms §8, replace the bullet):
> **Lifetime (Founders Flock)** means First Class on your STT account for as long as we run STT. It isn't a
> subscription and isn't transferable. If we stop running STT, we'll tell you at least 90 days before, keep your data
> available to download, and [if you bought within the previous 12 months, refund you in proportion to the time
> left]. If STT is sold, the buyer must honour lifetime plans.

**Withdrawal (EU/UK consumers)** (terms §8, add):
> If you live in the EU or UK you can withdraw from a website purchase within 14 days without giving a reason, using
> the "Withdraw from contract" button in Settings → Plan or at sillytraveltool.com/upgrade, or by emailing us. We refund
> you in full within 14 days. This is in addition to our 14-day refund for everyone.

**Yearly renewal consent** (text next to the Stripe checkout button and in Stripe Checkout custom text):
> First Class Yearly is $14.99 a year plus any tax, and renews automatically every year at the then-current price until
> you cancel. Cancel any time in Settings → Plan; you keep First Class to the end of the year you paid for. We'll email
> you before each renewal.

**Health data** (homepage footer link, and a separate page `/privacy/health-data/`): see L5 for the outline.

**Cookies** (new privacy section):
> On the website we use Google Analytics cookies to count visits, only after you allow it if you're in the EU or UK
> (and never if your browser sends Global Privacy Control or Do Not Track). The app stores your sign-in and settings on
> your device so it works offline. We don't use advertising cookies.

---

## 2. Privacy law: what applies at STT's size

| Law | Applies now? | Why | What to do now | Later |
|---|---|---|---|---|
| **GDPR (EU) and UK GDPR** | **Yes** for any EU/UK member: STT offers its service to people there (English site, beta open to all, prices shown, EU/UK age wording in the terms) (GDPR Art. 3(2)) | No size threshold | L1, L2 (lawful transfer), L8 (representative and DPAs), L10 (cookie consent), L6 (accurate notice); keep a one-page record of processing (L9) | A short DPIA if you keep health data plus AI parsing; respond to requests within one month |
| International transfer to China | Yes for booking emails parsed by DeepSeek | No adequacy decision; SCCs need a transfer impact assessment that China's state-access laws make very hard to pass; Berlin and Italian authorities acted against DeepSeek in 2025 | **Stop sending personal data to DeepSeek** (L2). Consent under Art. 49(1)(a) is a fallback for occasional transfers only, not routine processing | n/a |
| ePrivacy (cookies), EU and UK | Yes on the website | GA sets cookies; analytics cookies need prior consent in the EU (the UK's Data (Use and Access) Act 2025 is moving low-risk analytics to opt-out; check before relying on it) | L10: consent-by-default-denied for EU/UK visitors | n/a |
| EU representative (Art. 27) and UK representative | Likely yes | The exemption is only for occasional processing without large-scale sensitive data; STT processes continuously and holds health records | Appoint one EU and one UK representative service, name them in the policy (L8) | n/a |
| **CCPA/CPRA (California)** | **No**, not yet | Applies above $26.6M revenue, 100,000 California consumers, or half of revenue from selling or sharing data | Nothing required. The policy already says no sale or sharing; keep it true (no ad pixels) | Re-check at 50,000 California users |
| Other US state privacy laws (Texas, Oregon, Virginia, etc.) | Mostly no (thresholds of 100,000 residents, or small-business exemptions) | Texas exempts SBA small businesses except for selling sensitive data | Don't sell sensitive data; that's enough today | Re-check yearly |
| **Washington My Health My Data Act** | **Yes** | You're in Washington and collect vaccine records (and possibly insurance documents that reveal health conditions). No size threshold; small businesses already had to comply by 2024-06-30; private right of action through the Consumer Protection Act | L5 | Avoid any AI processing of health documents |
| Children (COPPA) | Low | COPPA bites on actual knowledge or child-directed services; STT is neither | L12 (age confirmation line); delete on discovery | Watch the state app-store age laws (Texas, Utah) as Apple's age-range signals roll out |
| **CAN-SPAM (US email)** | Yes for marketing emails | Needs a valid postal address (a USPS PO box or registered private mailbox is fine), clear unsubscribe honoured within 10 business days, honest subject lines | L3 (address), L11 (consent hygiene). Tips email defaults off; good | n/a |
| EU/UK email marketing (ePrivacy/PECR) | Yes for EU/UK members | Marketing email needs opt-in consent (UK allows a "soft opt-in" for your own customers) | Keep "Travel tips by email" off by default (it is); treat `former_members` with consent "unknown" as not mailable (audit S7) | n/a |

### Actions: privacy

- **L1. In-app AI consent sheet (Apple 5.1.2(i)).** Before the first forwarded email is processed, the first paste,
  file or photo import, and the first AI guide: a sheet that names the providers and countries (wording in §1), with
  "Allow" and "Not now", stored on the profile with a timestamp, revocable in Settings. For forwarded emails that
  arrive before consent: hold them and show "1 email waiting: allow Goose to read it?". Who: Claude (after go-ahead).
- **L2. Route personal data off DeepSeek.** In `_shared/gemini.ts`, add a `personal: true` flag for parse-booking-email,
  receive-booking-email, file/photo imports and anything with names or booking details; those calls go to Gemini only.
  Guides, packing lists, phrases and HONK (city and dates only) may stay on DeepSeek. **Owner:** confirm the Gemini
  API project has billing enabled (the free tier lets Google use inputs to improve its products; HANDOFF says AI Studio
  needed a top-up). Who: Claude, Owner.
- **L3. Business mailbox.** A USPS PO box or a virtual business address (registered as a commercial mail receiving
  agency so it's CAN-SPAM-valid) in Washington. Replace the home address in `public/privacy/`, `public/terms/`,
  `public/delete-account/` and `supabase/functions/_shared/emailTemplate.js` (2 places). Already on OWNER_TODO. Who:
  Owner, then Claude.
- **L4. Fix the stale deletion bullet** (wording in §1). Who: Claude.
- **L5. Washington consumer health data.** (a) A separate page "Consumer Health Data Privacy Policy" covering only what
  the Act asks: categories (vaccine records you add; any health information in documents you upload), purposes (show
  them to you in your wallet), sources (you), who receives them (Supabase as processor; nobody else), your rights
  (access, delete, withdraw consent) and how to use them. (b) A link to it in the homepage footer and the app's
  Settings → Privacy, labelled exactly "Consumer Health Data Privacy Policy". (c) When a member adds a vaccine record,
  one line: "Vaccine records are health information. We store them encrypted for you only and never share or sell
  them." with "Add" as the affirmative step. (d) Never send health documents to AI. Who: Claude drafts, Attorney
  reviews (an hour of a privacy lawyer's time), Owner approves.
- **L6. Correct the processors table and retention text** (Resend copy, AI provider abuse retention, Sentry row,
  Hostinger, Google Fonts or self-host, Klarna/Link). Who: Claude.
- **L7. Make the retention promise true** (audit S7/S8): extend `purge_old_usage()` to `email_sends`, `admin_audit`
  (keep 25 months), `former_members`, `beta_waitlist` after the beta, `member_notes`; drop the two
  `_backup_*_20261021` tables; null or hash `email_sends.email` and delete pending invites on account deletion. Who:
  Claude (migration, with backup first).
- **L8. EU and UK representative, and DPAs.** Appoint an EU and a UK GDPR representative (online services charge
  roughly EUR 100 to 700 a year each; a combined EU+UK plan is common) and add their contact to the policy. Accept or
  download the DPAs: Supabase (dashboard → legal documents), Google Cloud/Gemini API and Maps (Cloud Data Processing
  Addendum, accepted in the console), Google Analytics (Admin → Account settings → data processing terms), Stripe (in
  the Services Agreement), RevenueCat, Resend, Sentry (all publish DPAs to sign or accept online). DeepSeek has no DPA
  you can sign as far as I could find, which is the reason for L2. Who: Owner.
- **L9. One-page record of processing** (what data, why, which provider, where, how long). Claude can generate it from
  the policy table. Who: Claude.
- **L10. Cookie consent on the website.** In `src/lib/ga.js`, default `analytics_storage` to `denied` for visitors whose
  browser time zone or language points to the EU/EEA/UK, and show a two-button banner ("Allow stats" / "No thanks");
  keep today's behaviour elsewhere. Native apps don't need it (no cookies; ATT not triggered because nothing tracks
  across apps). Who: Claude.
- **L11. Email hygiene.** Treat `former_members` with consent "unknown" as not mailable; keep tips mail opt-in; every
  marketing email keeps the unsubscribe link and the business address. Who: Claude.
- **L12. Age line at sign-up.** "By continuing you confirm you're 13 or older (16 in the EU/UK) and accept the Terms
  and Privacy Policy." under the sign-in buttons. Who: Claude.

---

## 3. Payments and consumer law

| Topic | Status | Gap | Action |
|---|---|---|---|
| US auto-renew (ROSCA, state laws) | Paywall and `/upgrade/` show price, period, auto-renew and how to cancel; Stripe portal allows online cancel | California (since 2025-07-01) needs **express affirmative consent** to the renewal terms, a **record** of it kept 3 years, and for yearly plans a **reminder 15 to 45 days before renewal**; cancel online the same way you signed up (portal does this) | L15, L17 |
| FTC "click to cancel" rule | Vacated by the Eighth Circuit in July 2025; ROSCA still applies and the FTC still enforces it | None beyond the above | Keep cancel one click away |
| New York and other states | Similar disclosure and online-cancel rules | Covered by L15 to L17 | n/a |
| EU/UK 14-day withdrawal | Your 14-day refund covers the money | Since **2026-06-19** EU traders selling online must offer an online **withdrawal function** ("withdraw from contract here") for the 14 days, and say where it is before purchase; the UK has its own rules | L16 |
| Refund consistency | Web 14 days by email; Apple and Google refund under their policies; terms say so | Consistent. Make sure store listings don't promise refunds STT can't give in the stores | n/a |
| Lifetime ("Founders Flock") | Terms: "as long as we run STT"; copy: "yours for good" | Mismatch; no shutdown/sale promise; "Only while the Flock is open" is fine only if it really closes some day (no fake urgency) | L18 |
| Sales tax, US | Stripe: threshold monitoring, no `automatic_tax` | **Washington**: you're physically there, so nexus exists from the first sale; consumer digital services and subscriptions are very likely subject to WA retail sales tax (expanded again by ESSB 5814 from 2025-10-01) plus B&O tax. Other states: monitor economic-nexus thresholds (commonly $100,000) | L19, L21 |
| VAT, EU/UK | None collected | Non-EU sellers of digital services to EU consumers owe VAT **from the first sale** (register for the EU One Stop Shop, non-Union scheme); the UK likewise has no threshold for non-UK sellers. In-app purchases are fine: Apple and Google are the merchant and handle tax | L20 |
| Chargebacks | Statement descriptor `SILLY TRAVEL TOOL` (good); refunds handled in the dashboard | No written process | L22 |

### Actions: payments

- **L15. Renewal consent and record (California).** Add the yearly renewal sentence (wording in §1) directly above the
  web "Continue to secure payment" button and in Stripe Checkout `custom_text`, and turn on Stripe Checkout's terms
  consent checkbox (`consent_collection.terms_of_service = required`); Stripe stores the acceptance with the session,
  which is your 3-year record. Who: Claude.
- **L16. EU withdrawal button.** On `/upgrade/` and Settings → Plan, for 14 days after a web purchase, a "Withdraw from
  contract" button that refunds in full through Stripe and cancels; mention it in the paywall's small print. Simplest
  to offer to everyone (it is your 14-day refund, self-service). Who: Claude.
- **L17. Renewal reminder.** Turn on Stripe Billing's "upcoming renewal" customer emails (Settings → Billing →
  Subscriptions and emails) or send one from `admin-email` 30 days before each yearly renewal. Who: Owner (toggle) or
  Claude.
- **L18. Lifetime promise.** Change "yours for good" (PaywallSheet.jsx:150) and "on us, for good" (Onboarding.jsx:151)
  to "for as long as STT runs"; add the terms wording in §1 (90 days' notice, export, buyer honours). Owner decides the
  refund-on-shutdown line. Who: Owner decides; Claude edits.
- **L19. Washington registration and tax.** Apply for a Washington business license (UBI) through the Department of
  Revenue's Business Licensing Service, ask the CPA to confirm that STT's subscriptions are taxable as digital
  products or digital automated services, then enable Stripe Tax registration for Washington only and set
  `automatic_tax` on Checkout (Claude's code change). File the WA excise return (likely annual at this size; B&O
  small-business credit may zero it). Who: Owner, CPA, then Claude.
- **L20. EU/UK web sales.** Choose one: (a) register for EU OSS non-Union and UK VAT and let Stripe Tax collect
  (costs: registration time, quarterly returns); (b) for EU/UK buyers, hide the web checkout and point them to the App
  Store or Google Play, where the store is the merchant; (c) move web billing to a merchant-of-record service (Paddle,
  Lemon Squeezy) that handles global tax for about 5% + fees. My recommendation at this size: **(b)** until EU/UK web
  revenue is meaningful, then (a). Who: Owner decides with the CPA; Claude builds (b) if chosen.
- **L21. Monitor other states.** Leave Stripe's threshold monitoring on and look at the report quarterly. Who: Owner.
- **L22. Chargeback routine.** Refund anyone who asks within 14 days without argument (cheaper than a $15 dispute fee
  plus the charge); for disputes, submit the Stripe evidence pack (receipt, terms acceptance from L15, usage log). Who:
  Owner.

---

## 4. Platform compliance (Apple and Google)

| Rule | Where STT stands | Action |
|---|---|---|
| Apple 5.1.2(i): disclose and get **explicit permission** before sharing personal data with **third-party AI** (added November 2025) | **Not met**: imports go to DeepSeek or Gemini with no consent screen | L1 (before the next App Store submission; TestFlight beta review can also flag it) |
| Apple 5.1.1(v): in-app account deletion | Built (Profile → Settings → Delete account) | Fix the stale privacy bullet (L4) |
| Apple 4.8: Google sign-in needs an equivalent privacy-friendly login (Sign in with Apple qualifies) | Code built; provider needs the owner's Apple setup (OWNER_TODO) | Owner finishes the Services ID and key before production review |
| Apple 3.1.1/3.1.2: digital subscriptions through in-app purchase; ongoing value; renewal terms shown | Paywall has store prices, renewal text, Restore, Terms and Privacy | Keep. The US storefront now allows a link to web checkout; don't add one outside the US |
| Apple 1.2 / Google AI-generated content policy: report offensive AI content in the app | "Suggested by Goose (AI)" plus a Report link | Keep; make sure Report works on every AI surface (guide, HONK, packing, phrases, imports) |
| Apple 2.2 TestFlight: no compensation to testers; beta builds should be meant for public release | Beta group created; no rewards promised | Don't offer lifetime plans or codes **in exchange for** testing; a later thank-you code for everyone is fine |
| App privacy labels / Play Data safety | `docs/STORE_PRIVACY_FORMS.md`; "(check)" items open | After L2/L5, mark Health info as collected, optional, not shared; note AI providers as processors (collection, not sharing) |
| Apple EULA | No custom EULA | Keep Apple's standard EULA (add the link in the App Store description) and add one line to the terms (L13) |
| Google Play personal account: closed test with **12 testers for 14 days** before production | Personal account (Bodhi Studios) | Recruit 12+ testers now, or move to an organisation account after the LLC (exempt from the test; needs D-U-N-S) (L23) |
| Google Play account deletion URL | `/delete-account/` exists | Keep |
| Google Play subscriptions policy | Renewal text matches | Keep |

- **L23. Play testing.** Start the 14-day clock with 12 opted-in testers (machinemisha plus friends and family), or
  decide to move to an organisation account (L27). Who: Owner.
- **L24. Before App Store production review:** L1 shipped; Apple sign-in working; privacy page fixed (L4, L6); privacy
  labels updated. Who: Claude and Owner.

---

## 5. Marketing and AI content

### What the law requires for the fictional-traveller ads

1. **FTC Endorsement Guides (16 CFR Part 255).** An ad that presents people as real customers must use real customers
   or **clearly and conspicuously** disclose that they are not. "Clear and conspicuous" for video means the
   disclosure is on screen long enough to read, in the same medium as the claim (spoken claims need a spoken or
   prominent on-screen disclosure), and not hidden at the end.
2. **FTC rule on reviews and testimonials (16 CFR Part 465, in force since 2024-10-21).** Bans creating or
   disseminating testimonials that misrepresent being from someone who doesn't exist, including AI-generated people.
   Civil penalties of about $53,000 per violation. A fictional character is lawful only if the ad doesn't present
   them as a real customer.
3. **EU AI Act Article 50(4)** (applies since 2026-08-02): whoever publishes a deepfake (realistic AI-generated people or
   voices) must disclose that it's AI-generated. Applies to ads shown in the EU.
4. **Platform rules:** TikTok requires the "AI-generated content" label on realistic AI content; Meta applies or
   requires "AI info" for photorealistic video and realistic audio; YouTube requires "Altered or synthetic content" =
   Yes for realistic synthetic people or voices. Paid ads add each platform's ad-policy review.

### Where the current plan falls short

- The persona ads (Ana, Dev, Linda, Marcus) are first-person stories ("I...") with a synthetic voice; the creator ads
  are Veo-generated people talking to camera. The disclosure is a **1 to 2.6-second end card**, plus a caption line. A
  viewer who scrolls away after 5 seconds never sees it. That is the weak point under both FTC rules.
- `campaign-plan.md` says "caption includes #ad"; `POSTING_PACK.md` says "do not add #ad unless boosted". On your own
  brand accounts the post is obviously your advertising, so #ad isn't required; what matters is the "fictional" label.
- TikTok is a personal account posting your own product: turn on TikTok's content disclosure ("Your brand") as well.

### Actions: marketing

- **L30. Persistent label.** Re-render every persona and creator ad with a small, legible label on screen **from the
  first frame to the last**: "Fictional traveller · AI voice" (persona) or "AI-generated person · not a real customer"
  (creator), top corner, at least the subtitle's size, high contrast. Keep the end card. Who: Claude.
- **L31. Same words in the first line of every caption** (before "...more"), and the platform AI label on, as the
  posting pack already lists. Who: Owner when posting.
- **L32. Claims stay true.** Only features that exist; no invented numbers ("10,000 travellers love it"); no star
  ratings or quotes attributed to the characters outside the ads; never put a character's quote on the website or store
  listing as a review. Who: Claude (copy check), Owner.
- **L33. Footage hygiene.** Don't show Google Places photos in ads (Google's terms let you show them in the app with
  attribution, not reuse them in marketing); use STT's own art and demo data. Blur or avoid third-party logos (airline
  and hotel logos) beyond plain text names. Avoid styling the Goose like the "Untitled Goose Game" goose (a registered
  mark in class 9 and 28) in HONK-themed ads. Who: Claude.
- **L34. Music and voices.** On business accounts use only each platform's commercial music library. Check that your
  Speechify plan includes commercial voice-over rights, and that Veo/Gemini output from your Google plan can be used in
  ads; don't crop or remove any visible AI watermark. Who: Owner.

### Other content questions

- **Google Maps data in guides.** Verified: Places data shows "Places data from Google Maps" attribution
  (`PlaceMedia.jsx`), and caches stay within Google's 30-day limit (`places` cache: 30 days for coordinates and place
  search, 1 day for details, 6 hours for photos; guides 7 days). Low risk. Storing geocoded coordinates permanently
  inside bookings is a grey area under the 30-day rule; storing the place ID (allowed indefinitely) and re-fetching is
  the clean version. Low.
- **Forwarded booking emails (third-party content).** Members forward emails that name other travellers. The member is
  using STT for a personal purpose; STT is the controller of what it extracts. Terms §5 ("Don't upload anything you
  don't have the right to share") covers it. Keep the inbox sender check (PR #35, S4) so strangers can't file into a
  member's trips. Low.
- **AI output in the app.** Labelled and reportable; terms disclaim accuracy. Add one line that members may use AI
  output for their own trips (L13). Low.

---

## 6. Business structure

**Today:** you operate as a sole proprietor. Apple enrollment is Individual (seller shown as your legal name); the Play
developer name is "Bodhi Studios" on a personal account; Stripe is presumably an individual/sole-proprietor account;
terms and privacy name you personally with your home address.

**Why form an LLC now:** a limited liability company keeps business debts and most claims (a data breach claim, a
consumer suit, an IP dispute) against the company rather than your house and savings, as long as you keep finances
separate and sign as the company. It also lets Apple show a company as the seller, exempts the Play account from the
12-tester rule (organisation accounts), and gives you a clean owner for trademarks.

**Name:** "Bodhi Studios" is a weak choice to build on: a **Bodhi Studios, LLC** has published an app called "Bodhi
Studios" on the US App Store since 2023 (a fitness studio's booking app), **bodhistudios.com** is an app-developer site
publishing apps under that name, and Bodhi Studios Limited holds a UK mark (clothing). No registered US mark blocks
it, but you'd never be able to protect it. Simplest: **Silly Travel Tool LLC** (matches the trademark and the store
listing), or another distinctive name you check first in the Washington Corporations and Charities Filing System.

### Actions: structure (rough costs and timing)

- **L25. Form the LLC** at Washington's Corporations and Charities Filing System: certificate of formation $200
  online (initial report included), annual report about $60 to $70 a year. Use a commercial registered agent ($50 to
  $150 a year) so your home address isn't on the public record. Get an EIN (free, irs.gov, same day). Write a one-page
  operating agreement (single member). Who: Owner (1 to 3 days).
- **L26. Bank and books.** Business checking in the LLC's name; all STT income and costs through it from now on; keep
  receipts. Who: Owner (1 week).
- **L27. Move the accounts** (in this order):
  1. **Stripe:** update the account's business type to the LLC with the new EIN (Settings → Business details). If
     Stripe requires a new account for a new legal entity, open it and ask Stripe support to migrate customers and
     subscriptions; RevenueCat Web Billing is then reconnected. Who: Owner, Claude for the re-wiring.
  2. **Apple:** get a free D-U-N-S number for the LLC (Apple's lookup tool; up to 30 days), then ask Apple Developer
     Support to convert the Individual membership to an Organization (apps and TestFlight stay). Do it before the public
     App Store launch if the timing works, since the seller name is public. Who: Owner.
  3. **Google Play:** either change the account to an organisation (verification with D-U-N-S) or create an
     organisation account and transfer the app. Change the developer name to the LLC (or keep a brand name that is
     yours, see the IP plan). Who: Owner.
  4. **RevenueCat:** no entity change needed; re-enter store credentials if accounts change. Who: Claude.
  5. **Terms, privacy, delete-account page, email footer, App Store and Play contact details:** the LLC's name and the
     mailbox address. Who: Claude.
  6. **Trademarks:** file in the LLC's name (IP plan). Who: Owner/Attorney.
- **L28. Trade name.** If you keep any brand name that isn't the LLC's legal name (for example "Bodhi Studios"),
  register it as a trade name with the WA Business Licensing Service (small fee). Who: Owner.
- **L29. Keep the shield intact:** sign contracts as "[Company] LLC, by [name], Member"; don't pay personal costs from
  the business account; update the annual report on time. Who: Owner.

Total first-year cost of L25 to L28: roughly $350 to $650 plus your time; nothing in the apps changes.

---

## 7. Security and liability posture

### Breach duties (if personal data leaks)

| Where | Who must be told | Deadline |
|---|---|---|
| Washington (RCW 19.255.010) | Each affected Washington resident; the Attorney General if more than 500 Washington residents | Within 30 days of discovery |
| Other US states | Residents of each state under its law (California, for example) | Usually "without unreasonable delay", 30 to 60 days |
| EU (GDPR Art. 33/34) | The data protection authority (with no EU office, the authority in each affected country, via your EU representative); affected users if high risk | 72 hours to the authority |
| UK | ICO; users if high risk | 72 hours |
| Apple / Google | Their developer terms require prompt notice for security incidents involving their users' data | Promptly |

Passport numbers are encrypted at rest; that helps (several states' breach laws don't count encrypted data if the key
isn't also taken), but names plus booking details plus travel documents make STT a meaningful breach target.

- **L35. One-page incident runbook** (`docs/INCIDENT_RUNBOOK.md`): who to call, how to rotate Supabase service keys,
  Stripe, Resend, RevenueCat and Google keys, how to turn on the cockpit kill switches, how to pull the affected-user
  list, the notice templates above, and a log. Claude can draft it. Who: Claude, Owner.
- **L36. Insurance.** A combined technology errors-and-omissions and cyber liability policy, $1M limit, for a one-person
  app business typically costs roughly $500 to $1,500 a year (quotes through online brokers; needs the LLC first). It
  pays for breach notification, forensics and defence costs. General liability is optional at this stage. Who: Owner.

### Open-source licence compliance (scan run 2026-10-25)

`npx license-checker@25.0.1 --summary` in the worktree after `npm ci`:

- **Shipped (production) dependencies:** MIT 47, 0BSD 1, plus STT itself (UNLICENSED, i.e. private). All permissive;
  no copyleft (GPL/AGPL) anywhere.
- **All dependencies including build tools (691):** MIT 555, ISC 52, Apache-2.0 26, BSD-2-Clause 18, BlueOak-1.0.0 16,
  BSD-3-Clause 9, and a handful of Unlicense, 0BSD, CC-BY-4.0 (`caniuse-lite`, build-time data), Python-2.0
  (`argparse`, build-time), dual MIT/WTFPL and AFL/BSD. Nothing that restricts a paid closed-source app.
- **Obligation:** MIT, BSD and Apache require keeping the copyright and licence notices when you distribute the code.
  The minified web bundle and the app binaries drop them.
- **L37. Open-source notices:** generate `public/legal/open-source.txt` at build time (`license-checker --production`
  for npm, plus the Android Gradle and iOS CocoaPods/SPM lists for Capacitor, RevenueCat and AndroidX) and link it from
  Settings → About and the site footer. Who: Claude.
- **Note on video tools:** the `video/` workspace uses Remotion, whose licence is free for individuals and companies of
  up to three people and paid above that. Fine today; re-check if you hire.

### L13. Terms additions (low priority, attorney to confirm)

- Liability cap: "our total liability is limited to the amount you paid us in the 12 months before the claim, or $50
  if you haven't paid", keeping the existing consumer carve-out.
- Venue: courts in King County, Washington, except that either side may use small-claims court where you live.
- Beta: "Beta features may change or be removed; beta builds may not charge you."
- App stores: "If you got STT from the App Store, Apple's standard licence agreement also applies."
- AI output: "You may use what Goose writes for your own trips. It's provided without any promise that it's accurate."
- Keep it plain English; skip arbitration clauses at this size (they bring their own consumer-law requirements).

---

## All actions, numbered

| # | Action | Rating | Who | Cost | Time |
|---|---|---|---|---|---|
| L1 | In-app AI consent sheet (Apple 5.1.2(i), GDPR transparency) | High | Claude | $0 | 1 day |
| L2 | Route personal-data AI calls to Gemini (paid); DeepSeek only for non-personal requests | High | Claude, Owner | Cents/day | 1 day |
| L3 | PO box or virtual business address; replace home address on 3 pages and in email footers | High | Owner, Claude | $100 to $300/yr | 1 week |
| L4 | Fix stale in-app deletion bullet | Medium | Claude | $0 | 10 min |
| L5 | Washington Consumer Health Data Privacy Policy, homepage link, vaccine-record consent line | High | Claude, Attorney | $300 to $600 | 1 day |
| L6 | Correct processors table and retention text | Medium | Claude | $0 | 1 hour |
| L7 | Extend purges and deletion cleanup (audit S7, S8) | Medium | Claude | $0 | Half a day |
| L8 | EU and UK representative; accept DPAs | Medium | Owner | EUR 200 to 1,000/yr | 1 week |
| L9 | One-page record of processing | Low | Claude | $0 | 1 hour |
| L10 | EU/UK cookie consent for website GA | Medium | Claude | $0 | Half a day |
| L11 | Email consent hygiene (former members, opt-in tips) | Low | Claude | $0 | 1 hour |
| L12 | Age and terms line at sign-up | Low | Claude | $0 | 15 min |
| L13 | Terms additions (cap, venue, beta, Apple EULA, AI output) | Low | Claude, Attorney | Part of attorney review | 1 hour |
| L14 | "Download my data" export before the past-trip lock | Medium | Claude | $0 | 1 to 2 days |
| L15 | California renewal consent and record in Stripe Checkout | Medium | Claude | $0 | Half a day |
| L16 | EU online withdrawal button (self-service 14-day refund) | Medium | Claude | $0 | 1 day |
| L17 | Yearly renewal reminder email | Medium | Owner/Claude | $0 | 15 min |
| L18 | Align "lifetime" copy and terms (shutdown and sale promise) | Medium | Owner, Claude | $0 | 1 hour |
| L19 | WA business license, confirm taxability, Stripe Tax for WA | High | Owner, CPA, Claude | $50 to $90 + 0.5% + CPA | 1 to 2 weeks |
| L20 | EU/UK web sales: route to stores (recommended) or register for VAT | High | Owner, CPA | $0 (b) | Days |
| L21 | Quarterly look at state tax thresholds | Low | Owner | $0 | Ongoing |
| L22 | Chargeback routine | Low | Owner | $0 | n/a |
| L23 | Play 12-tester closed test, or organisation account | Medium | Owner | $0 | 14 days |
| L24 | App Store production checklist (L1, Apple sign-in, policy, labels) | High | Claude, Owner | $0 | Before submission |
| L25 | Form the LLC (distinct name), registered agent, EIN, operating agreement | High | Owner | ~$250 to $350 | 1 to 3 days |
| L26 | Business bank account and books | High | Owner | $0 | 1 week |
| L27 | Move Stripe, Apple, Play, RevenueCat, legal pages and trademarks to the LLC | Medium | Owner, Claude | $0 | 2 to 6 weeks |
| L28 | Register any trade name | Low | Owner | Small fee | 1 day |
| L29 | Keep the liability shield (sign as the LLC, no commingling) | Medium | Owner | $0 | Ongoing |
| L30 | Persistent "fictional / AI-generated" label on every persona and creator ad | High | Claude | $0 | 1 day |
| L31 | Caption first line and platform AI labels | High | Owner | $0 | Per post |
| L32 | Truthful claims; no character quotes as reviews | Medium | Claude, Owner | $0 | Ongoing |
| L33 | No Google Places photos or third-party logos in ads | Low | Claude | $0 | 1 hour |
| L34 | Commercial music libraries; confirm Speechify and Veo commercial rights | Low | Owner | $0 | 1 hour |
| L35 | Incident runbook | Medium | Claude, Owner | $0 | 2 hours |
| L36 | Tech E&O and cyber insurance | Medium | Owner | $500 to $1,500/yr | 1 week |
| L37 | Open-source notices file and link | Low | Claude | $0 | 1 hour |

**Attorney package to ask for** (one flat-fee engagement, typically $1,500 to $3,000 for a small app): review of the
updated terms and privacy policy, the health-data page, the AI-transfer approach (L1/L2), the LLC paperwork, and the
trademark filings in the IP plan. A CPA consult ($200 to $500) for L19 and L20.

---

## Sources (checked 2026-10-25)

- Apple App Review Guidelines (5.1.2(i), 4.8, 5.1.1(v), 3.1.1, 3.1.2, 1.2, 2.2): https://developer.apple.com/app-store/review/guidelines/
- Apple's November 2025 third-party AI change, reporting: https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai
- Google Play closed-testing requirement for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play AI-generated content reporting requirement: https://techcrunch.com/2024/06/06/google-play-cracks-down-on-ai-apps-after-circulation-of-apps-for-making-deepfake-nudes
- Washington My Health My Data Act FAQ (homepage link, small business): https://nursing.wa.gov/sites/default/files/2025-03/My-Health-My-Data-FAQ.pdf
- Washington breach notification (30 days; AG over 500 residents): https://www.atg.wa.gov/washington-s-data-breach-notification-laws
- Washington ESSB 5814 sales-tax expansion (2025-10-01): https://www.plantemoran.com/explore-our-thinking/insight/2025/10/washington-expands-sales-tax-to-include-additional-services
- Washington LLC fees: https://www.llcuniversity.com/washington-llc/costs/ (confirm at sos.wa.gov)
- California automatic renewal amendments (AB 2863, 2025-07-01): https://btlaw.com/en/insights/alerts/2025/california-expands-automatic-renewal-law-new-requirements-now-in-effect
- EU withdrawal function, Directive 2023/2673 (2026-06-19): https://www.gtlaw.com/en/insights/2026/5/eu-consumer-law-new-withdrawal-button-requirements-for-online-contracts
- EU AI Act Article 50 in force 2026-08-02: https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force
- FTC rule on consumer reviews and testimonials (16 CFR 465): https://www.fenwick.com/insights/publications/the-ftc-cracks-down-on-fake-reviews-with-new-rule
- DeepSeek and EU regulators (Berlin, Italy): https://www.jurist.org/news/2025/06/germany-data-commissioner-orders-apple-and-google-to-remove-deepseek-over-data-concerns
- "Bodhi Studios, LLC" App Store seller: https://apps.apple.com/us/developer/bodhi-studios-llc/id1695098646 ; bodhistudios.com
- Licence scan output: run `npx license-checker@25.0.1 --summary` (and `--production`) after `npm ci`.
