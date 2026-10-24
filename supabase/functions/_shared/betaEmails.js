// Beta waitlist emails (beta-signup, beta-invite), rendered with the member email template.
// Plain JS so scripts/test-beta-emails.mjs can run it in Node. Only live features; never "free"; no emoji.
import { render } from './emailTemplate.js'

export const PLATFORM_LABEL = { ios: 'iPhone', android: 'Android', web: 'the web' }
const WHY = "You're getting this because you joined the Silly Travel Tool beta list at sillytraveltool.com/beta."

const CONFIRM = {
  subject: "You're on the list",
  body: `Hi,

Thanks for joining the Silly Travel Tool beta. You're on the list for early access on {{platform_label}}.

When the beta opens, Goose will send your private download link to this address. We'll only email you about the beta.

{{web_line}}

While you wait, here's what you'll get: forward a booking confirmation and it lands in the right trip, your itinerary laid out day by day, and the weather for every stop.

See you soon,
Goose at Silly Travel Tool`,
}

const INVITE = {
  ios: {
    subject: 'Your Silly Travel Tool beta invite for iPhone',
    body: `Hi,

The Silly Travel Tool beta is open, and you're in.

On your iPhone:
1. Install TestFlight, Apple's beta app, from the App Store.
2. Open the button below on the same iPhone, tap Accept, then Install.

Please keep this link to yourself while we're in beta. Reply to this email with anything that breaks or confuses you. Goose reads every reply.`,
    cta_label: 'Join the iPhone beta',
  },
  android: {
    subject: 'Your Silly Travel Tool beta invite for Android',
    body: `Hi,

The Silly Travel Tool beta is open, and you're in.

On your Android phone, open the button below, tap Become a tester, then install Silly Travel Tool from Google Play. Use the Google account you sign in to Play with.

Please keep this link to yourself while we're in beta. Reply to this email with anything that breaks or confuses you. Goose reads every reply.`,
    cta_label: 'Join the Android beta',
  },
  web: {
    subject: 'Your Silly Travel Tool beta invite',
    body: `Hi,

The Silly Travel Tool beta is open, and you're in.

Open the button below to create your account. It works in any browser, on your phone or your computer.

Please keep this link to yourself while we're in beta. Reply to this email with anything that breaks or confuses you. Goose reads every reply.`,
    cta_label: 'Create your account',
  },
}

export function confirmEmail({ platform, unsubscribeUrl }) {
  // The web app is live today: anyone can start there while the phone apps are in beta
  const web_line = platform === 'web'
    ? "Good news: the web app is already live. Start now at [sillytraveltool.com](https://sillytraveltool.com/?utm_source=beta_email&utm_medium=email&utm_campaign=beta)."
    : "Can't wait? The web app is already live at [sillytraveltool.com](https://sillytraveltool.com/?utm_source=beta_email&utm_medium=email&utm_campaign=beta), and your trips will be there when the app arrives."
  return render(CONFIRM, { platform_label: PLATFORM_LABEL[platform] || 'your phone', web_line }, { kind: 'marketing', unsubscribeUrl, why: WHY })
}

export function inviteEmail({ platform, link, unsubscribeUrl, test }) {
  const tpl = INVITE[platform]
  const m = render({ ...tpl, cta_url: link }, {}, { kind: 'marketing', unsubscribeUrl, why: WHY })
  return test ? { ...m, subject: `[Test] ${m.subject}` } : m
}
