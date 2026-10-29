# Store privacy forms — answers to paste (2026-10-24)

Source of truth: `public/privacy/index.html`. If the policy changes, update this file and both forms.
Owner pastes these into Play Console (App content → Data safety) and App Store Connect (App Privacy) once the
accounts exist. Judgment calls are marked **(check)**.

## Shared facts
- No ads, no ad SDKs, no data sold, no tracking across other companies' apps or sites (IDFA not used).
- All traffic is HTTPS (encrypted in transit). Passport/document numbers are also encrypted at rest.
- Processors (Supabase, DeepSeek, Gemini, Google Maps, Resend, Stripe, RevenueCat, Google Analytics, Sentry) act for us,
  so under both stores' rules this is **collection, not sharing**.
- Account deletion: in the app (Profile → Settings → Delete account) and on the web at
  `https://sillytraveltool.com/delete-account/` (Play needs this URL).
- Usage stats are optional (Settings → Share usage stats). Location is optional (OS prompt).
- AI reading (Apple 5.1.2(i)): forwarded emails, imports and typed translations go to DeepSeek (China; Gemini for photos
  and PDFs) only after the member taps Allow (tour step or first import; Settings → AI reading of imports). Until then
  forwarded emails are held unread. App Review notes can point to this.
- Crash reports (Sentry) are sent only while Share usage stats is on, never from the dev server, and carry no email
  addresses (URLs with emails or `eq.` filters are stripped before sending) and no user ID. Crash logs stay **Optional**.

## Google Play — Data safety
Top questions: collects data **Yes** · shares data **No** · encrypted in transit **Yes** · users can request deletion
**Yes** (URL above) · committed to Play Families policy **No** (not a kids app).

| Category → type | Collected | Optional? | Ephemeral? | Purposes |
|---|---|---|---|---|
| Location → Approximate location | Yes | Optional | Yes | App functionality |
| Location → Precise location | Yes | Optional | Yes | App functionality |
| Personal info → Name | Yes | Required | No | App functionality, Account management |
| Personal info → Email address | Yes | Required | No | App functionality, Account management, Developer communications |
| Personal info → User IDs | Yes | Required | No | App functionality, Analytics, Account management |
| Personal info → Other info (passport / document numbers you add) | Yes | Optional | No | App functionality |
| Financial info → Purchase history | Yes | Optional | No | App functionality, Account management |
| Messages → Emails (booking emails you forward) | Yes | Optional | Yes **(check: we keep extracted bookings, not the email)** | App functionality |
| Photos and videos → Photos (imports) | Yes | Optional | Yes | App functionality |
| Files and docs (imported PDFs, spreadsheets) | Yes | Optional | Yes | App functionality |
| Health and fitness → Health info (vaccination record, if added) **(check)** | Yes | Optional | No | App functionality |
| App activity → App interactions | Yes | Optional | No | Analytics, Personalization |
| App activity → In-app search history (city/place searches) | Yes | Optional | Yes | App functionality |
| App activity → Other user-generated content (trips, bookings, notes, lists) | Yes | Required | No | App functionality, Personalization |
| App info and performance → Crash logs | Yes | Optional (none when Share usage stats is off) | No | Analytics |
| App info and performance → Diagnostics | Yes | Optional | No | Analytics |
| Device or other IDs (GA device identifier) | Yes | Optional | No | Analytics |

"Personalization" covers the traveller profile; "Developer communications" covers opt-in tips emails.

## Apple — App Privacy ("nutrition label")
**Data used to track you: none.** Everything below is **Data Linked to You**.

| Apple category → type | Purposes |
|---|---|
| Contact Info → Name, Email Address | App Functionality, Developer's Advertising or Marketing (opt-in emails) |
| Location → Coarse Location | App Functionality |
| Location → Precise Location **(check: only sent in real time, never stored; Apple lets you omit it if not retained)** | App Functionality |
| Health & Fitness → Health (vaccination record, if added) **(check)** | App Functionality |
| Financial Info → (none; Stripe/Apple hold the card) | — |
| User Content → Emails or Text Messages (forwarded booking emails) | App Functionality |
| User Content → Photos or Videos (imports) | App Functionality |
| User Content → Other User Content (trips, bookings, documents, notes) | App Functionality, Product Personalization |
| Identifiers → User ID | App Functionality, Analytics |
| Identifiers → Device ID (GA device identifier, not IDFA) | Analytics |
| Purchases → Purchase History | App Functionality |
| Search History (city/place searches) | App Functionality |
| Usage Data → Product Interaction | Analytics, Product Personalization |
| Diagnostics → Crash Data, Other Diagnostic Data | Analytics |

Other App Store fields:
- Privacy Policy URL: `https://sillytraveltool.com/privacy/`
- Account deletion: in app (guideline 5.1.1(v)) — built, see HANDOFF.
- Sign in with Apple offered alongside Google (guideline 4.8) — built; needs the Apple Developer setup in `docs/OWNER_TODO.md`.
- Age rating questionnaire: no objectionable content; user-generated content is private (not shared publicly); AI
  output is labeled and reportable.
