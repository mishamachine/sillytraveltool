# Branded sign-in emails: setup guide

Why: the stock Supabase emails (password reset, magic link, confirm signup, change email) have generic copy, link to a `*.supabase.co` address and come from a no-reply sender. Gmail can treat them as phishing and hide them. The fix has three parts: our own link (`sillytraveltool.com/auth/confirm`), our own wording, and a sender that looks like us.

The templates are in `supabase/templates/`. Nothing here changes by itself: the owner pastes them into the Supabase dashboard.

## Order (do not skip ahead)

1. **Merge** the pull request.
2. **Deploy the website** (upload `dist/` to Hostinger as usual). Check that `https://sillytraveltool.com/auth/confirm` loads the page with a Continue button, not the 404 page. The templates link there, so it has to exist first.
3. **Paste the templates** (below).
4. **Set the sender** (below).
5. **Send a test reset** to an address you own. Open the email, tap the button, tap Continue, set a new password.

If you paste the templates before step 2, reset links will land on a 404 page.

## 1. Check the URL settings

Supabase dashboard, Authentication, URL Configuration:

- **Site URL**: `https://sillytraveltool.com` (no trailing slash). The templates build their links from it.
- **Redirect URLs**: keep the existing entries. The new links do not use a redirect URL, but the sign-in forms still send one, and the app's own scheme entry (`com.sillytraveltool.app://**`) is still needed for the mobile apps.

## 2. Paste the templates

Dashboard, Authentication, Email Templates. For each row: set the **Subject**, then replace the **Message body** with the file contents. Each file starts with two comment lines (subject and a reminder); paste from `<!DOCTYPE html>` onwards.

| Dashboard row | File | Subject |
|---|---|---|
| Reset Password | `supabase/templates/recovery.html` | Reset your Silly Travel Tool password |
| Magic Link | `supabase/templates/magic-link.html` | Your Silly Travel Tool sign-in link |
| Confirm signup | `supabase/templates/confirmation.html` | Confirm your Silly Travel Tool account |
| Change Email Address | `supabase/templates/email-change.html` | Confirm your Silly Travel Tool email change |

Leave the "Invite user" row alone: the app sends its own trip invites.

For the website, the links look like `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. `{{ .ConfirmationURL }}` appears only in the `{{ else }}` branch, for the mobile apps.

## 3. Set the sender

Dashboard, Authentication, SMTP Settings (Resend is already connected).

- **Sender name**: `Silly Travel Tool`
- **Sender email**: `account@bookings.sillytraveltool.com`. `hello@` would also work; `account@` says what the mail is. Either is fine on the domain Resend has already verified, so this needs **no new DNS records**. Keep the other SMTP fields as they are.
- In Resend, for the `bookings.sillytraveltool.com` domain, turn **click tracking off**. Tracking rewrites every link to a Resend address, which brings back the "link goes somewhere else" look and can break the one-time token. Open tracking can stay off too.

The emails do not invite replies. If you want replies to reach a person, check where mail for that address goes first.

## 4. Test

1. In a private window, open the site, choose Continue with email, Forgot password, and enter your own address.
2. The email should arrive in the inbox (check Spam once) from "Silly Travel Tool", with our wording and a button to `sillytraveltool.com`.
3. Tap the button. You should see "Reset your password" and a Continue button. Nothing is used up until you tap it.
4. Continue, then set a new password. Open the same email link a second time: you should see the friendly "That link has run out" page with a way to ask for a new one.

## Rollback

Before pasting, copy the current text of each row somewhere safe. To roll back, paste it back into each row and set the sender back. The website page is harmless to leave in place.

## Notes

- The mobile apps keep working: each template checks where the request came from. The website sends `https://sillytraveltool.com`, so it gets the new `/auth/confirm` link. The apps send their own address (`com.sillytraveltool.app://auth-callback`), so they still get Supabase's own link (`{{ .ConfirmationURL }}`), which opens the app. Do not remove the `{{ if }}` lines when pasting.
- Until a template is pasted, that email keeps the old behaviour.
- Strong sender reputation matters too: SPF, DKIM and DMARC on the Resend domain should all pass (Resend shows this on the domain page).
