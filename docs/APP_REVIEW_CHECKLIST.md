# App Review checklist: Silly Travel Tool 0.20.0 (iOS)

Reviewer's-eye pass, 2026-10-26. App Store Connect app 6826753531, version 0.20.0 (Prepare for Submission), build 5
selected (Beta App Review approved). Checked against the App Review Guidelines, the live App Store Connect record (read
through ASC's own API in the owner's signed-in Chrome), the code on `main` (71c6788) and the live site.

**Verdict:** submit **build 6** with this PR, not build 5. Build 5 calls itself a beta in the app and in one iPad
screenshot (2.2). Separately, the demo account has **no password yet**, so nothing can be submitted until the owner
sets one.

## Status by guideline

| Guideline | Status | What was checked / done |
|---|---|---|
| 2.1 App completeness: demo account | **Owner** | `machinemisha@gmail.com` exists, but it has **no password** (Google sign-in only; checked in `auth.users`). Its Goose inbox only accepts mail from its own address (`inbox_accept_any = false`), so a reviewer's forward would be dropped silently. Both are owner clicks (below). Account is on the free plan with 0 trips, which suits the paywall and New trip paths. |
| 2.1 Paths the reviewer will try | Pass (code) | Sign in (email step shows email + password, verified on the live site), Trips → New trip, + → Paste confirmation text, Settings → Get First Class (paywall), Restore purchases (bottom of the paywall), Settings → Delete account (type DELETE). Review notes name every path. Not run on a device in this pass: a sandbox purchase. |
| 2.2 Beta, demo, trial | **Fixed (needs build 6)** | App Store text: review notes said "beta", now removed; description, promo text, keywords and What's New (empty for a first version) had none. In the app: tour pill "Beta", tour note "thank you for testing STT", Profile/Help card "Beta · Thanks for testing STT early", Help answer "STT is in beta", report email subject "STT beta issue". All reworded in this PR; Report an issue kept. **iPad screenshot 5 (Profile) shows the Beta card**: swap it for `docs/screenshots/app-review/after-ipad-05-profile.png` (2064×2752). TestFlight text left as is. |
| 2.3 Accurate metadata | Fixed | Description claims checked against the code. "with expiry reminders" overclaimed (the wallet shows in-app expiry badges, no notifications): now "flags anything close to expiry". No "AI-powered" hype; AI is mentioned once, as a label. Keywords: generic terms only, no brands or competitors. Subtitle "Trip planner & itinerary". Screenshots: 7 iPhone 6.3" + 5 iPad 13". The iPad shots show the phone-width column the app really draws on iPad, so they are accurate. |
| 3.1.1 In-app purchase | Pass | Apps buy through StoreKit via RevenueCat only (`src/lib/purchases.js`); both products exist with 175 territories, prices, localisations and review screenshots, status Prepare for Submission. Both still need ticking on the version page (below). Paid Apps Agreement, bank and W-9 active. |
| 3.1.2 Subscriptions | Pass | Paywall (`PaywallSheet.jsx`) shows store price and period, auto-renew and the 24-hour rule, how to cancel, Terms and Privacy links, Restore purchases; lifetime marked one-time. Description ends with Privacy Policy and Terms of Use links (Terms cover store billing, renewal, refunds through Apple). No custom EULA, so Apple's standard EULA applies. Subscription group "First Class" has an en-US localisation. |
| 3.1.3 No steering to web payment | Pass | Native builds never link to `/upgrade/`; tour prices and "$14.99" copy only render on the web (`STORE === 'stripe'`); Help has no website-purchase wording; a website subscriber sees only the renewal date in the app. |
| 4.0 Design / crashes | Pass | Tip tool crash fixed (PR #14) and in build 5, which passed Beta App Review. No placeholder screens found. Build 6 changes copy only. |
| 4.8 Sign in with Apple | Pass | Apple provider is on in Supabase (`/auth/v1/settings`), "Continue with Apple" shows first, above Google (live site screenshot). |
| 5.1.1 Privacy labels vs. what the app sends | Pass | App Privacy published and matches `docs/STORE_PRIVACY_FORMS.md`: no tracking; GA device ID for analytics only, Sentry crash data without emails or user ID, both off when Share usage stats is off. Purpose strings present for camera, photos, location. |
| 5.1.1(v) Account deletion | Pass | Profile → Settings → Delete account, plus `/delete-account/`. Review notes ask the reviewer to test it last or with a new Sign in with Apple account. |
| 5.1.2(i) Sharing data with third-party AI | **Owner decision** | Since November 2025 the guideline says apps must disclose and get **explicit permission** before sharing personal data with third-party AI. Build 5 only has a one-line notice on the sign-in screen ("Goose uses AI to read bookings…"); forwarded booking emails go to DeepSeek and Gemini. PR #42 adds the Allow step. It is a stated requirement, so treat it as **before approval**: put PR #42 in build 6 (its migration and function deploys go first). Reviewers enforce this unevenly, so build 6 without it may pass, but it is the most likely rejection after 2.2. |
| 1.2 User-generated content | Pass | No public content: trips are shared only with people the owner invites by email. AI text is labelled and has a Report button. Age rating says no UGC, which is right. |
| Age rating | Pass | 12+ (alcohol references infrequent: bars in guides). No gambling, contests, web browsing, chat. |
| 5.3 Gaming, contests | N/A | None. |
| Export compliance | Pass | `ITSAppUsesNonExemptEncryption = false` in Info.plist; build 5 reports `usesNonExemptEncryption: false`. HTTPS only. |
| 5.6 Developer identity (note) | FYI | The developer account is an individual: the store shows **Babar Ali** as seller, and the EU Digital Services Act trader page shows the Redmond address. Copyright line says "2026 B&B Project Factory". Fine for review; an organisation account is needed to show B&B Project Factory as seller. |

## Changed in App Store Connect today (text fields only)
- **App Review notes**: rewritten. Says the demo account is email and password, Google works with any Google account and
  Apple with any Apple Account, the demo inbox accepts any sender, and asks to test deletion last. "Beta" paragraph
  replaced by a neutral Feedback line.
- **Lifetime IAP review note** (was empty): where the paywall is.
- **Description**: "with expiry reminders" → "that flags anything close to expiry".
- Not touched: TestFlight text, screenshots, IAP display names, prices, privacy answers, age rating, build.

## Owner clicks, in order
1. **Set the demo password.** On sillytraveltool.com → Continue with email → Forgot password? → `machinemisha@gmail.com`
   → open the reset link in that inbox → set a password. Sign out, then sign in with email + password to confirm it works.
2. **Open the demo inbox to any sender.** Still as machinemisha: Profile → Settings → Goose inbox → **Accept from any
   sender** on. (The review notes now promise this.)
3. **Decide on build 6** (recommended): merge this PR (and PR #42 after its deploys), then run
   `.github/workflows/ios-release.yml` (Actions → iOS release → Run workflow). When build 6 finishes processing, select
   it on the 0.20.0 version page instead of build 5.
4. **iPad screenshot 5:** App Store Connect → 0.20.0 → iPad 13" Display → delete `05-profile.png`, upload
   `docs/screenshots/app-review/after-ipad-05-profile.png`.
5. **App Review Information:** tick **Sign-in required**, user name `machinemisha@gmail.com`, the password from step 1, Save.
6. **In-App Purchases and Subscriptions** section on the version page: add **First Class Yearly** and **Founders Flock
   (lifetime)**.
7. **Add for Review** → **Submit for Review**.

**If you submit build 5 now instead:** skip steps 3 and 4 only if you accept the risk. The reviewer will see "Beta" on
the first tour screen, at the bottom of Profile and in the iPad screenshot. Guideline 2.2 is a common, fast rejection;
the fix would then be this same build 6, about one extra review round (typically 1–2 days) later.

## Proof
- Before/after at 375 px (demo mode, light): `docs/screenshots/app-review/before-*.png`, `after-*.png`.
- Live sign-in (fresh browser): `live-signin-welcome.png` (Apple, Google, email), `live-signin-email.png` (email +
  password fields).
- `npm run build`: passed, dist check clean. `grep -rni beta src` outside the website-only `/beta`, admin and
  unsubscribe pages: no user-visible matches.
