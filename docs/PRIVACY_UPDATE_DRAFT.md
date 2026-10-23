# Privacy update (2026-10-23) — signed off

**Owner decisions (2026-10-23):** D1 option A (keep DeepSeek first, disclose it), D2 25 months, D3 Settings switch,
D4 no marketing email yet, D5 no ad-platform uploads, D6 done (Babar Ali, Renton WA address on privacy and terms, live 2026-10-23).
**Done:** `public/privacy/index.html` rewritten (effective 23 Oct 2026); `user_profiles.tailored_offers` + Settings →
Tailored offers; nightly `purge-old-usage` pg_cron job (migration `20261023130000`); Audience and offer suggestions skip
opted-out members. **Website deploy pending** (owner to approve).

Covers the owner cockpit (member profiles, segments, affluence band, support and moderation), the new tracking
(active time, first-touch source, session context), Stripe and codes. Nothing here is live: `public/privacy/` is
unchanged until you approve. This is a careful draft, not legal advice; a lawyer's read before launch is worth it.

## 0. Decisions needed before this can go live

| # | Decision | Why it matters | My recommendation |
|---|---|---|---|
| D1 | **DeepSeek.** AI runs on DeepSeek first (Gemini only as fallback). DeepSeek processes data in China. | Today's policy names only Google Gemini, so it's inaccurate already. China has no EU/UK adequacy decision; many users and both stores' reviewers notice this. | Either disclose it (text below, option A) or switch forwarded emails, files and anything with booking details to Gemini only and keep DeepSeek for non-personal requests like guides (option B). B is the safer story. |
| D2 | **How long we keep usage events.** No limit exists today. | GDPR needs a stated period; the stores ask about deletion. | 25 months, then deleted (I can add a nightly cleanup). Member profiles are recomputed from live data, so nothing extra to delete. |
| D3 | **Opting out of profiling for marketing.** | GDPR gives a right to object to profiling for marketing; California regulations cover it too. | Add a Settings switch "Use my trips to tailor offers" (on by default, off excludes them from segments and offers). Until it exists, honour objections by email. |
| D4 | **Marketing emails.** No opt-in or unsubscribe exists yet. | EU, UK and Canada need opt-in before marketing email. | Keep "no marketing emails without your consent" true: don't send any until the opt-in and unsubscribe ship (step 2). |
| D5 | **Ad platforms.** | Uploading member lists to Meta/TikTok would make this "sharing" (California) and "tracking" (Apple), and flip several store answers. | Don't, for now. The answers below assume no ad-platform uploads. |
| D6 | **Operator details.** The page still says `[OPERATOR LEGAL NAME], [POSTAL ADDRESS]`. | Required by GDPR and both stores. | Fill in before launch. |

## 1. Privacy page changes (ready to paste into `public/privacy/index.html`)

Header: **Effective [date you publish] · Last updated [same]**

**The short version** (replace):
> We keep your trips, bookings and travel documents so the app can show them to you. We also look at how the app is
> used, and at the kind of trips you plan, to improve STT and to tell you about things that fit your travel. We don't
> sell your data, don't show ads and don't share it with advertisers. Some features use AI and other services, listed
> below, which only get what they need to do their job. You can turn usage stats off, object to tailored offers, and ask
> us to delete everything at any time.

**What we collect → Usage and diagnostics** (replace):
> Product events (for example "trip created", "guide viewed", which screen was opened, how long a screen was actively
> in use), plus once per session a few device settings: device type (phone, tablet or computer), operating system,
> whether you use the app, an installed web app or a browser, language, time zone, light or dark theme, connection type
> and how many days since your last visit. When you first arrive we note where you came from (the referring website or a
> campaign tag in the link) and save it with your account when you sign up. Events carry only short codes: no names,
> emails, trip titles, confirmation or document numbers, typed text or exact locations. They're stored with your account
> in our database and also sent to Google Analytics, on the website and in the apps, with a random device identifier and
> your account's random ID (never your email), IP addresses anonymised and no advertising features. If the app crashes
> we may receive an error report without personal data.
>
> **Your choice:** turn off Settings → Share usage stats to stop all usage events, session details and source tracking on
> that device. If your browser sends Do Not Track or Global Privacy Control, it starts off.

**What we collect → Payments** (new):
> If you buy First Class on the website, payment is handled by Stripe. We receive your purchase details (plan, amount,
> date, status, refunds, any discount code) but never your full card number. In the apps, purchases go through Apple or
> Google, who share the purchase status with us. Codes you redeem are recorded with your account.

**What we collect → Your traveller profile** (new):
> From the trips and bookings you add, we work out a short profile used inside STT: for example how often and how long
> you travel, how far ahead you plan, whether you travel solo or with others, the regions you visit, how you usually
> book, and a broad travel-style band (from value to luxury) based on cabin class, hotel prices, room types and
> loyalty status you've saved. It's never shown publicly, never sold, never used to change prices or what you can use,
> and never used to make decisions with legal or similarly significant effects on you. We use it to understand our
> travellers as a group, to decide what to build, to choose partners, and (with your consent where the law requires it) to
> send you offers that fit your trips. You can object at any time (see Your choices).

**Why we use it** (replace the list):
> - To run the app: show your trips, import bookings, build guides, packing lists and phrasebooks.
> - To keep your account and the service secure and prevent abuse: rate limits, reviewing unusual activity, and
>   restricting or suspending accounts that break our Terms.
> - To support you: when you contact us, our team can look at your account details, your trips' places, dates and
>   counts, your plan and your recent app activity. Access is limited to our admins, protected by sign-in checks and
>   logged. Booking details such as confirmation numbers are not shown in these tools; we only open them to answer a data
>   request from you.
> - To improve the app: usage events and traveller profiles, looked at per member and as a group.
> - To manage payments, codes and refunds.
> - To tell you about things that fit your travel. No marketing emails without your consent, and every one has an
>   unsubscribe link.
>
> Where the law asks for a legal basis: performing our contract with you (running the app, payments, support), our
> legitimate interests in keeping it secure, improving it and understanding our travellers (including usage stats and
> traveller profiles, which you can turn off or object to), your consent for location and for marketing emails, and
> legal obligations (for example tax records for payments).

**Who processes it for us** (table; new or changed rows marked):

| Service | What for | What it receives |
|---|---|---|
| Supabase (US) | Database, sign-in, server functions | All app data |
| **DeepSeek (China)** *(option A only)* | AI: reading booking emails and files, city guides, HONK picks, packing lists, phrases | The email, file text or request text |
| Google Gemini API (US) | AI, as above (main or backup provider) | As above |
| **Google Maps Platform (US)** | Place search, place details, photos, travel times | Search text, place IDs, coordinates of places you look up |
| Resend | Receiving forwarded booking emails; sending invites and account emails | Those emails |
| **Stripe (US)** | Website payments, discount codes | Your email, purchase and payment details (Stripe holds the card) |
| **Apple, Google Play** | In-app purchases (when the apps sell First Class) | Purchase status |
| Google (sign-in) | "Continue with Google" | Your Google sign-in |
| Open-Meteo | Weather and past-trip weather | Trip coordinates and dates |
| OpenStreetMap Nominatim, Komoot Photon, BigDataCloud, timeapi.io | City search, coordinates to city, local time | Search text or coordinates |
| open.er-api.com, flagcdn.com | Exchange rates, flag images | Currency or country codes only |
| Google Analytics | Usage statistics for the website and apps | Pseudonymous usage events, device and browser type |
| Sentry (if enabled) | Crash reports | Technical error details, no personal data |

> We don't sell or rent personal data, and we don't share it for advertising or cross-context behavioural advertising.

**How long we keep it** (replace):
> Account, trip and booking data: until you delete it or your account. Usage events: 25 months, then deleted. Payment
> records: as long as tax and accounting law requires (usually 7 years), even after account deletion. Records of
> moderation decisions (for example a ban for abuse): as long as needed to keep the service safe. When your account is
> deleted we erase everything else within 30 days, including backups.

**Your choices and rights** (add these items):
> - Turn off Settings → Share usage stats to stop usage events and session details on that device.
> - Object to your traveller profile being used for offers by emailing us (a switch in Settings is coming), or
>   unsubscribe from any marketing email.
> - Redeem codes and manage purchases: website purchases through the link in your receipt; app purchases in your Apple
>   or Google account settings.

**Account decisions** (new short section):
> To protect travellers and the service, we may warn, limit features on, suspend or close accounts that break our
> Terms, for example by automating AI features or abusing invites. A person reviews these decisions, the reason is
> recorded, and you can reply to the email we send to ask us to look again.

**International transfers** (replace, option A wording):
> Our main servers are in the United States, and some AI requests are processed in China by DeepSeek. If you use STT
> from elsewhere, your data is transferred to those countries, protected by our providers' contractual safeguards
> (such as the EU Standard Contractual Clauses where they apply).

(Option B: keep today's sentence and drop the DeepSeek row.)

## 2. Google Play Data safety answers

Play counts data as **collected** when it leaves the device; data sent to our own service providers is **not shared**.

**Overview questions**
- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS everywhere)
- Do you provide a way for users to request that their data is deleted? **Yes**; in-app (Profile → Settings → Delete
  account) and a web link (required): use `https://sillytraveltool.com/privacy#rights` or a dedicated deletion page.
- Shared data: **None**; all third parties are service providers acting for us. (Changes if D5 changes.)

**Data types** (Collected · Required or optional · Ephemeral? · Purposes)

| Category | Type | Collected | Optional? | Ephemeral | Purposes |
|---|---|---|---|---|---|
| Personal info | Name | Yes | Required (from sign-in) | No | App functionality, Account management |
| Personal info | Email address | Yes | Required | No | App functionality, Account management, Developer communications, Fraud prevention and security |
| Personal info | User IDs | Yes | Required | No | App functionality, Analytics, Account management, Fraud prevention and security |
| Personal info | Other info (passport/document numbers, loyalty numbers) | Yes | Optional | No | App functionality |
| Financial info | Purchase history | Yes | Optional | No | App functionality, Analytics, Account management |
| Health and fitness | Health info (vaccination records users choose to store) | Yes | Optional | No | App functionality |
| Location | Precise location | Yes | Optional | **Yes** (used for the request, not stored) | App functionality |
| Location | Approximate location | Yes | Optional | **Yes** | App functionality |
| Messages | Emails (forwarded booking emails) | Yes | Optional | No | App functionality |
| Photos and videos | Photos (screenshots/photos for import) | Yes | Optional | **Yes** (read, not stored) | App functionality |
| Files and docs | Files and docs (PDF/CSV/Excel for import) | Yes | Optional | **Yes** | App functionality |
| App activity | App interactions | Yes | Optional (Share usage stats) | No | Analytics, App functionality, Personalization, Developer communications |
| App activity | Other user-generated content (trips, bookings, notes) | Yes | Required for core use | No | App functionality, Personalization |
| App activity | Other actions (source campaign) | Yes | Optional | No | Analytics |
| App info and performance | Crash logs | Yes | Optional | No | Analytics |
| App info and performance | Diagnostics (device type, OS, connection, error types) | Yes | Optional | No | Analytics |
| Device or other IDs | Device or other IDs (random analytics device ID) | Yes | Optional | No | Analytics |

Notes:
- **Personalization** and **Developer communications** are ticked because traveller profiles tailor offers and emails.
  Untick them if you decide not to use profiles for offers.
- **Advertising or marketing** stays unticked as long as nothing goes to ad networks (D5).
- Payment card details: **not collected** (Stripe, Google and Apple handle them).

## 3. App Store privacy answers (App Store Connect → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.
**Tracking:** **No.** STT doesn't link its data with other companies' data for ads and doesn't share it with data
brokers; Google Analytics runs with advertising features and Google signals off. (Flips to Yes if D5 changes.) No App
Tracking Transparency prompt needed.

| Data type | Collected | Linked to the user | Used for tracking | Purposes |
|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | App Functionality |
| Contact Info → Email Address | Yes | Yes | No | App Functionality, Developer's Advertising or Marketing (only with consent; untick if no marketing) |
| Health & Fitness → Health (vaccination records) | Yes | Yes | No | App Functionality |
| Financial Info → none | No | | | Stripe/Apple hold card data |
| Location → Precise / Coarse | **No** (see note) | | | |
| User Content → Emails or Text Messages | Yes | Yes | No | App Functionality |
| User Content → Photos or Videos | No (read for import, not kept) | | | |
| User Content → Other User Content (trips, bookings, notes, documents) | Yes | Yes | No | App Functionality, Product Personalization |
| Identifiers → User ID | Yes | Yes | No | App Functionality, Analytics |
| Identifiers → Device ID | Yes | Yes | No | Analytics |
| Purchases → Purchase History | Yes | Yes | No | App Functionality, Analytics |
| Usage Data → Product Interaction | Yes | Yes | No | Analytics, Product Personalization, Developer's Advertising or Marketing |
| Usage Data → Other Usage Data (source campaign, session context) | Yes | Yes | No | Analytics |
| Diagnostics → Crash Data | Yes | Yes | No | App Functionality, Analytics |
| Diagnostics → Other Diagnostic Data | Yes | Yes | No | Analytics |
| Sensitive Info | No | | | |
| Other Data → Other Data Types (passport and loyalty numbers) | Yes | Yes | No | App Functionality |

Notes:
- **Location:** Apple doesn't count data that's only used for the request in real time and not kept. SOS and HONK fit
  that, and Play still asks you to list it as "ephemeral". If you'd rather be conservative, declare Precise Location
  (App Functionality, linked, not tracking); there's no review downside to over-declaring.
- **Developer's Advertising or Marketing** covers using profiles to choose who gets which offer. Drop it from
  Email, Product Interaction and Play's Personalization if you decide profiles won't drive offers.
- Apple also requires the privacy policy URL (sillytraveltool.com/privacy) and, for apps with accounts, in-app account
  deletion. That's already there.

## 4. After sign-off I'll

1. Update `public/privacy/index.html` with section 1 (and the chosen D1 option), new effective date, and deploy.
2. Build what the text promises: the 25-month event cleanup (D2) and the "tailored offers" Settings switch (D3), which
   segments and offers would respect.
3. Hand you the Play and App Store answers as a checklist to enter (both consoles need you signed in).

## 5. Store console checklist (you enter these; both consoles need you signed in)

**Google Play Console → App content → Data safety**
1. Data collection and security: Yes, collects data · encrypted in transit: Yes · deletion request: Yes, with the URL
   `https://sillytraveltool.com/privacy/#rights`.
2. Tick the data types in section 2 exactly as listed; for each, "Collected" only (not shared), the Optional/Required
   and Ephemeral answers from the table, and the purposes listed.
3. Save, then Submit for review with the next release.

**App Store Connect → App Privacy** (when the iOS app exists)
1. Privacy policy URL: `https://sillytraveltool.com/privacy/`.
2. "Do you collect data?" Yes. For each type in section 3: collected, linked to the user, **not** used for tracking,
   purposes as listed.
3. Tracking: No. Publish.

Re-check both forms if anything changes: a new AI or analytics provider, ad-platform audiences, or the paywall's
in-app purchases (Purchase History is already declared).
