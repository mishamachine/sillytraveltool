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
    subject: "You're in: test Silly Travel Tool on Android",
    body: `You signed up for the Silly Travel Tool beta, and Android is ready for you. Two quick steps on your phone:
1. Join the beta group: {{group_url}} (use the Google account on your phone)
2. Install the app: {{install_url}}

Forward a booking confirmation to your Goose inbox and watch your trip build itself.

One favour: keep the beta installed for at least two weeks. It's how we unlock the public launch on Google Play.

Questions or bugs? Reply to hello@sillytraveltool.com.`,
    cta_label: 'Join the beta group',
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

export const ANDROID_GROUP_URL = 'https://groups.google.com/g/sillytraveltool-beta'

// link = the platform's app_settings.beta link. Android is two steps: the Google Group (groupLink, falls back to the
// constant) and the Play testing page (link = android_url).
export function inviteEmail({ platform, link, groupLink, unsubscribeUrl, test }) {
  const tpl = INVITE[platform]
  const android = platform === 'android'
  const group = groupLink || ANDROID_GROUP_URL
  const m = render({ ...tpl, cta_url: android ? group : link }, android ? { group_url: `[${group}](${group})`, install_url: `[${link}](${link})` } : {}, { kind: 'marketing', unsubscribeUrl, why: WHY })
  return test ? { ...m, subject: `[Test] ${m.subject}` } : m
}
