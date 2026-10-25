# Native release: TestFlight and Google Play testing

How a signed beta gets from this repo to TestFlight (iOS) and Play testing (Android). Both builds run on GitHub
Actions; nothing needs Xcode or Android Studio on the owner's Mac.

| | iOS | Android |
|---|---|---|
| Workflow | `.github/workflows/ios-release.yml` ("iOS release") | `.github/workflows/android-release.yml` ("Android release") |
| Output | uploaded to App Store Connect → TestFlight (+ `ios-release-ipa` artifact) | `android-release-aab` artifact (signed `.aab`), uploaded by hand in Play Console |
| Version | `package.json` `version` (0.20.0) | same |
| Build number | `package.json` `versionCode` (5) | same (`versionCode`) |

Both stores refuse a build number they have already seen: bump `versionCode` in `package.json` for every upload
(or use the workflow's `build_number` / `version_code` input for a one-off re-run). Native builds go to
`dist-native/` (Capacitor `webDir`), so a web build in `dist/` (with the Stripe `/upgrade/` page) is never packaged.

## Run

```bash
gh workflow run ios-release.yml --ref main
gh workflow run android-release.yml --ref main
gh run download <run id> -n android-release-aab
```

Until the workflows are on `main`, pushes to `claude/fix-native-release-729fd6` run them instead (a push never
uploads to TestFlight). `upload: false` signs and exports the `.ipa` without uploading.

## Secrets

Set with `gh secret set` from the repo folder. `gh secret set NAME` with no value prompts for it (hidden), so
nothing lands in shell history. Never paste a value into a workflow input: the repo is public.

| Secret | Used by | Where it comes from | Status 2026-10-25 |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | both | the public values the website ships | set |
| `VITE_REVENUECAT_IOS_KEY` | iOS | RevenueCat → project → API keys → App Store public SDK key (`appl_…`) | **to set** |
| `VITE_REVENUECAT_ANDROID_KEY` | Android | RevenueCat → Play Store public SDK key (`goog_…`) | **to set** |
| `VITE_SENTRY_DSN` | both (optional) | the same DSN as `.env.local` | **to set** |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_B64` | iOS | App Store Connect API key (below) | set |
| `APPLE_TEAM_ID` | iOS | developer.apple.com → Membership details → Team ID | set |
| `STT_KEYSTORE_B64`, `STT_KEYSTORE_PASSWORD`, `STT_KEY_ALIAS`, `STT_KEY_PASSWORD` | Android | the upload key in `~/.stt` (below) | **to set** |
| `IOS_CERT_P12_B64`, `IOS_CERT_PASSWORD`, `IOS_PROFILE_B64` | iOS | only if automatic signing fails (below) | not needed |

```bash
# RevenueCat keys (prompts for each value)
gh secret set VITE_REVENUECAT_IOS_KEY
gh secret set VITE_REVENUECAT_ANDROID_KEY
# Sentry, straight from .env.local
grep '^VITE_SENTRY_DSN=' .env.local | cut -d= -f2- | tr -d '\n' | gh secret set VITE_SENTRY_DSN
# Android upload key (values from ~/.stt/keystore.env, never printed)
source ~/.stt/keystore.env
base64 -i ~/.stt/upload-keystore.jks | tr -d '\n' | gh secret set STT_KEYSTORE_B64
printf %s "$STT_KEYSTORE_PASSWORD" | gh secret set STT_KEYSTORE_PASSWORD
printf %s "$STT_KEY_ALIAS" | gh secret set STT_KEY_ALIAS
printf %s "$STT_KEY_PASSWORD" | gh secret set STT_KEY_PASSWORD
```

Without a RevenueCat key the app builds and runs but has no paywall at all (Settings → Plan just says "Free",
limits explain themselves). A `test_…` key gives RevenueCat's Test Store: fine for a first look, not real purchases.

## iOS: what App Store Connect needs

1. **Bundle ID** `com.sillytraveltool.app` registered (developer.apple.com → Identifiers). Automatic signing
   registers it itself if missing; In-App Purchase is on by default.
2. **App record** in App Store Connect → Apps → + New App: iOS, name "Silly Travel Tool", bundle ID above, any
   SKU (e.g. `stt-ios`). The upload fails with "no suitable application records" until this exists.
3. **API key**: Users and Access → Integrations → App Store Connect API → Team Keys → +, role **Admin** (Admin is
   what lets Xcode create the cloud-managed distribution certificate; App Manager can upload but not sign).
   Download `AuthKey_<id>.p8` (once only), then:
   ```bash
   gh secret set ASC_KEY_ID          # the key's ID
   gh secret set ASC_ISSUER_ID       # Issuer ID at the top of the keys page
   base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' | gh secret set ASC_KEY_P8_B64
   gh secret set APPLE_TEAM_ID       # Membership details → Team ID
   ```
4. **TestFlight**: internal testers (App Store Connect users, up to 100) can install as soon as Apple finishes
   processing (~10–30 min). External testers need the Test Information page filled (beta description, feedback
   email, privacy policy URL) and a Beta App Review of the first build (often under a day).
5. Export compliance is answered in `Info.plist` (`ITSAppUsesNonExemptEncryption` = false), so builds don't wait
   on the encryption question.

**Signing.** The workflow prefers automatic (cloud) signing with the API key: no certificate exports, no devices.
It archives unsigned (signing an archive would need a development profile, which needs a registered device) and
the export signs it "Apple Distribution" with Apple's cloud-managed certificate (checked: run 40166147809). If automatic signing is refused, fall back to manual: create an Apple Distribution certificate and an App
Store provisioning profile for `com.sillytraveltool.app`, then set `IOS_CERT_P12_B64` (base64 of the `.p12`),
`IOS_CERT_PASSWORD` and `IOS_PROFILE_B64` (base64 of the `.mobileprovision`); the workflow switches by itself.

## Android: the upload key and Play Console

- **Upload key**: `~/.stt/upload-keystore.jks` (alias `upload`, RSA 4096, valid to 2054), passwords only in
  `~/.stt/keystore.env`. Not in the repo. **Back both files up** (password manager or an encrypted drive): with Play
  App Signing a lost upload key can be reset through Play support, but it takes days.
  Upload certificate SHA-256: `F9:A9:02:1D:4B:A1:AE:7F:33:16:CC:05:C1:05:08:63:D1:30:3F:27:03:C3:73:03:47:E8:08:EC:7A:FD:FF:E2`.
- **Local signed build** (Android Studio's Java):
  ```bash
  source ~/.stt/keystore.env
  npm run build:native
  cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
  ```
  Without `STT_KEYSTORE_PATH` a release build comes out unsigned; debug builds are unaffected.
- **Play Console**: create the app (package `com.sillytraveltool.app`), keep Play App Signing on (default), then
  Testing → Internal testing → Create release → upload `app-release.aab`. Internal testing works right away.
  A personal developer account made after Nov 2023 must run a closed test with at least 12 testers for 14 days
  before it can apply for production.

## The paywall in the apps (store rules)

- Only the store's own local prices, from RevenueCat; never the web prices. Until the store answers, the price is a
  placeholder and Buy is off; if it sends nothing, "Prices are loading" with Try again.
- Renewal terms per store: iOS says Apple Account, "renews automatically unless cancelled at least 24 hours before
  the end of the period" and App Store account settings; Android says Google Play → Payments and subscriptions.
- Restore purchases, Terms and Privacy stay on the sheet.
- Proof (cloud emulator run 40165940574, all 14 checks passed): `docs/screenshots/android-paywall/`.
- Demo builds only: `?store=none` / `?store=prices` stand in for the store so the cloud emulator can check both
  states (`scripts/android-emu-shots.mjs`). Production builds compile this away.
