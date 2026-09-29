# OmniMail Mobile Handoff Document

> **Status**: Verified & Functional  
> **Last Verified**: 2026-09-28  
> **Location**: `/Users/ata/Dev/mobile_expo_apps/omnimail`

---

## 1. Executive Summary

OmniMail Mobile is the companion mobile application for OmniMail. It connects to the webmail control plane running on Next.js 16 + PostgreSQL. It implements complete mail reading/writing, multi-account inbox aggregation, calendar agenda tracking, and device push notification integration.

---

## 2. Authentication & Credential Architecture

- **Protocol**: Bearer Token Authentication.
- **Storage**: Hardware-backed encrypted key-value store via `expo-secure-store`.
  - `omnimail_server_url`: Stored backend target (default `https://webmail.altixcode.com`).
  - `omnimail_auth_token`: Cryptographically signed session token returned by `POST /api/auth/login`.
  - `omnimail_user_profile`: Cached user object for instantaneous offline startup.
  - `omnimail_device_token`: Cached push notification token.
- **Boot Lifecycle**: On cold start, `AuthProvider` reads the secure store, verifies the token against `GET /api/auth/me`, and smoothly redirects between `<LoginScreen />` and the main tabs.

---

## 3. Backend Endpoints Consumed

| Endpoint | Method | Purpose in Mobile App |
|---|---|---|
| `/api/auth/login` | `POST` | Authenticate with `{ email, password }`, retrieves `{ token, user }` |
| `/api/auth/register` | `POST` | Register a new user account with `{ email, password, name? }` |
| `/api/auth/me` | `GET` | Validates session token validity |
| `/api/auth/logout` | `POST` | Invalidates remote session |
| `/api/messages` | `GET` | Infinite scroll list (`page`, `limit=30`, `view`, `accountId`, `unreadOnly`, `query`) |
| `/api/messages/[id]` | `GET` | Retrieves full message body (`bodyHtml`, `bodyText`, thread messages, attachments) |
| `/api/messages/[id]` | `PATCH` | Updates message flags (`isStarred`, `isRead`, `folderId`) |
| `/api/messages/[id]` | `DELETE` | Moves message to trash or permanently deletes |
| `/api/messages/batch` | `POST` | Batch actions: `archive`, `trash`, `mark-read`, `mark-unread` |
| `/api/messages/send` | `POST` | Sends outbound email via connected SMTP account |
| `/api/accounts` | `GET` | Lists user's connected mailboxes & IMAP sync status |
| `/api/sync` | `POST` | Triggers background IMAP/CalDAV synchronization |
| `/api/calendar` | `GET` | Fetches calendars and scheduled events |
| `/api/devices` | `POST` | Registers Expo push token `{ token, platform, deviceId, deviceModel }` |
| `/api/devices` | `DELETE` | Unregisters push token on logout or permission revocation |
| `/api/devices/test-push` | `POST` | Triggers a real test notification to the user's active device |

---

## 4. Push Notification Wake-Up & Response Flow

1. **Foreground Handler**: `Notifications.setNotificationHandler` displays banner alerts, plays sound, and sets application badges when notifications arrive while the app is active.
2. **Notification Response Listener**: `Notifications.addNotificationResponseReceivedListener` intercepts when the user taps on any system alert. If `data.messageId` is present, it directly pushes `/message/[id]` into the navigation stack.
3. **Background Sync Registration**: `registerBackgroundNotificationTask` hooks into the OS background wake-up payload (`_contentAvailable: true`), allowing silent message updates before the app is resumed.

---

## 5. Screen Breakdown

1. **`app/login.tsx`**:
   - Connection & authentication screen.
   - Allows changing OmniMail Server URL for self-hosters or local development (`http://localhost:3000`).
   - Securely persists credentials and token.
2. **`app/(tabs)/index.tsx`**:
   - Unified Inbox view.
   - Account switcher modal, Folder view switcher (Inbox, Starred, Sent, Archive, Trash, All), and Unread filter.
   - Live debounced search calling `/api/messages?query=...`.
   - Infinite scroll pagination (`FlatList` `onEndReached`).
   - Pull-to-refresh triggering server synchronization.
   - Floating compose button.
3. **`app/message/[id].tsx`**:
   - Detail email viewer.
   - WebView HTML renderer with sandboxed theme styling + fallback plaintext renderer.
   - Attachment download & inspection list.
   - Action bar: Reply, Reply All, Forward (prefills compose), Star, Mark Unread, Archive, Trash.
4. **`app/compose.tsx`**:
   - Outbound composer with account selector dropdown.
   - To, Cc, Subject, multiline body.
   - Dispatches via `POST /api/messages/send`.
5. **`app/(tabs)/calendar.tsx`**:
   - Agenda view grouping events by date (Today, Tomorrow, upcoming dates).
   - Calendar filter chips with distinctive calendar color badges.
   - Displays event start/end times, locations, and descriptions.
6. **`app/(tabs)/settings.tsx`**:
   - Profile overview and server status.
   - Connected mail account status list.
   - Push notification toggle, push token inspection, and "Send Test Push Notification" action.
   - Light / Dark theme toggle.
   - Secure sign-out.

---

## 6. Verification Results

All automated checks passed:
- `npx tsc --noEmit`: **0 errors**
- `npx expo export --platform ios`: **Pass (3,050 modules bundled, 5.33 MB)**
- `npx expo export --platform android`: **Pass (3,049 modules bundled, 5.34 MB)**
- `npx expo export --platform web`: **Pass (2,684 modules bundled, 3.05 MB)**

---

## 7. Push Notifications Production Setup (Apple APNs & Google FCM)

For push notifications to reach **physical devices** in production, TestFlight, or standalone builds, the Apple APNs key and Google Firebase FCM v1 key must be linked to Expo / EAS.

### 7.1. Apple (iOS APNs)
1. **Enable Push Notifications Capability on App ID**:
   - Go to [Apple Developer Portal → Identifiers](https://developer.apple.com/account/resources/identifiers/list).
   - Find App ID: `com.altixcode.omnimail`.
   - Under Capabilities, check **Push Notifications** and click **Save**.
2. **Create or Reuse APNs Key (`.p8`)**:
   - Go to [Apple Developer Portal → Keys](https://developer.apple.com/account/resources/authkeys/list).
   - If an APNs key already exists for AltixCode, it can be shared (one key covers all apps on the developer team).
   - If creating a new key: Click **+**, name it `AltixCode APNs Key`, check **Apple Push Notifications service (APNs)**, click **Continue** → **Register** → **Download** (`AuthKey_XXXXXXXXXX.p8`). Note the 10-character **Key ID** and your **Team ID**.
3. **Upload Key to Expo / EAS**:
   - From `Dev/mobile_expo_apps/omnimail`, run:
     ```bash
     eas credentials
     ```
   - Select **iOS** → **production** (or preview) → **Push Notifications Key** → upload the `.p8` file, Key ID, and Team ID.

### 7.2. Google (Android FCM v1)
1. **Firebase Console Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/) and open the AltixCode project.
   - Click **Add App** → Select **Android**.
   - Set package name to `com.altixcode.omnimail` and register.
   - Download `google-services.json` into `Dev/mobile_expo_apps/omnimail/google-services.json`.
   - In `app.json`, ensure `"googleServicesFile": "./google-services.json"` is present under `"android"`.
2. **Generate FCM v1 Service Account Key**:
   - In Firebase Console: Project Settings (gear icon) → **Service accounts** tab.
   - Click **Generate new private key** to download the JSON service account key.
3. **Upload FCM v1 Key to Expo**:
   - Run:
     ```bash
     eas credentials
     ```
   - Select **Android** → **production** (or preview) → **FCM V1 Service Account Key** → upload the JSON file.

### 7.3. Current In-App Configuration
- `app.json` has `UIBackgroundModes: ["remote-notification", "fetch"]` configured.
- `app.json` has `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` declared.
- Notifications service automatically resolves `projectId` from EAS configuration.
- Local simulated rich notifications work out-of-the-box on simulators via Settings → **Send Test Push Notification**.

---

## 9. CI/CD, Store Records & Known Issues (2026-09-28)

**"Verified & Functional" at the top of this doc was not accurate as of
this date** -- the app crash-looped on launch on iOS 26+ (Xcode 27) with
`UIScene life cycle is required for apps built with this SDK`, and past
that, `Cannot find native module 'ExpoAsset'`. Both are fixed (see git
history: "fix: app was crash-looping on launch..."); confirmed working by
launching on a real simulator, not just `tsc`/`expo export`, which both
passed the whole time despite the app never actually opening.

**Repo & pipeline**: pushed to `AltixCode/omnimail-mobile` on both GitHub
and Forgejo (git.altixcode.com), matching the rest of the mobile fleet's
dual-remote setup. `.github/workflows/{ci,deploy}.yml` added, adapted
from `mobile_expo_apps/klondo`'s with the AdMob/RevenueCat/paywall-specific
steps stripped (this app has none of those). Signing uses the fleet's
shared **org-level** Forgejo secrets/keystore -- no per-repo secrets
needed. EAS project created: `altixcodes-team/omnimail`
(`fbbc79c9-3810-4515-8a72-40726ce6f4e1`), wired into `extra.eas.projectId`
for push token resolution.

**Bundle id `com.altixcode.omnimail`** registered in App Store Connect
with the Push Notifications capability enabled. **The app record itself**
(what shows up in TestFlight) could not be created -- Apple has no public
API for it; it only exists via an authenticated-browser trick (see
project memory `asc-app-record-creation`), and no ASC session was
available in any local browser this session. Needs a human to sign into
appstoreconnect.apple.com once.

**Play Console**: app record not created -- hit the weekly app-creation
quota. `ENABLE_PLAY_UPLOAD=false` set on the repo so CI's Android job
doesn't turn red for it; flip back to `true` once registered.

**CI reliability, found the hard way (4 consecutive dispatches)**:
- One of the fleet's self-hosted macOS runners (`Atas-Mac-mini`) fails
  *every* iOS archive for this bundle id with `Revoke certificate: Your
  account already has an Apple Development signing certificate for this
  machine, but its private key is not installed in your keychain`. This
  is a local Xcode machine-identity cache issue on that one Mac (confirmed
  nothing to revoke server-side via the ASC API), not fixable without a
  password for that machine's `root` user (its `forgejo-runner` daemon
  runs as root, unlike the fleet's other Mac runners). See project memory
  `ios-signing-ephemeral-keychain` for the full trail. Until fixed, expect
  iOS CI to fail whenever it lands on this runner -- retry via
  `workflow_dispatch` (`platform: ios`) until it lands elsewhere.
- The Android job (Hetzner Linux runner) has, at least once, built a
  valid APK+AAB successfully (`BUILD SUCCESSFUL`, both artifacts written)
  and then had Forgejo report the *job* as failed anyway, with no error
  visible anywhere in its own log. Not yet root-caused; worth another
  look if it recurs.

**Also fixed this session** (unrelated to the crash, found by
`npx expo install --check`): `expo-asset` and `expo-splash-screen` were
pinned to versions of a much newer Expo SDK (`^57.x`) than this app
targets (52) -- corrected to `~11.0.5` / `~0.29.24`.

**Security finding, not yet fixed**: on a simulator that had previously
been used for a real login, launching the app fresh and signing in with a
brand-new, zero-connected-accounts test user showed **that other, real
account's inbox** (Gmail/business mail, including what looked like a
credential-leak alert) instead of the test account's (empty) one. The
backend API confirms the test account has zero connected accounts, so
this reads as a **client-side stale-session/cache bug** -- `expo-secure-store`
or a local cache not being cleared between logins on the same device --
rather than a backend cross-tenant leak, but this was not fully isolated.
Reproduce carefully (a fresh simulator, watching for it) before assuming
it's fixed; don't screenshot or demo on a device that has ever held a
real session without confirming this first.

**Screenshots**: `store/screenshots/ios-6.9/01-login.png` is a real
capture (1206x2622, the correct "iPhone 6.9-inch Display" resolution) of
the unauthenticated login screen only. iPad 13" and Android screenshots,
and any authenticated-state screenshots, are still outstanding -- blocked
on the security finding above being resolved first.

**App icon**: replaced the placeholder (a generic video-player icon) with
a real mark generated by `scripts/generate-assets.mjs` (a dependency-free
port of the shared template's generator). Re-run it after any palette
change in the script's own `ACCENT`/`ACCENT_LIGHT`/`INK` constants.

## 10. Update (2026-09-28, later same day)

**iOS CI now fully builds, signs and exports** -- confirmed on run 17:
`ARCHIVE SUCCEEDED`, `EXPORT SUCCEEDED`, valid IPA produced. The only
remaining failure is the TestFlight upload step itself:
`Unable to find Apple ID for Bundle ID 'com.altixcode.omnimail' ...
Either create this app in App Store Connect first` -- i.e. it is now
blocked on nothing but the ASC app record (§9). The `Atas-Mac-mini`
certificate issue from §9 is still real and will still bite builds that
land there, but is no longer blocking every run.

**Push notifications, done end-to-end for Android, iOS still pending a
browser session:**
- Created a new Firebase project (`omnimail-d2512`), registered
  `com.altixcode.omnimail` as its Android app, committed the resulting
  `google-services.json` (client-side config, not a secret) and wired
  `android.googleServicesFile` into `app.json`.
- Generated a Firebase Admin SDK service account key and uploaded it as
  this EAS project's FCM V1 push credential via `eas credentials`
  (Android -> Google Service Account -> Push Notifications (FCM V1) ->
  Upload a Google Service Account Key), confirmed assigned on read-back.
  Key backed up at `~/Certificates/omnimail-fcm-service-account.json` on
  Atas-Mac-mini.
- `eas credentials` has an "Add a new push key" auto-generate path for
  APNs, but it requires logging into an Apple account *inside the CLI*
  (asks for Apple ID email/password) -- refused that and instead need
  the manual "Path to P8 file" entry point, which needs a `.p8` created
  via developer.apple.com/account/resources/authkeys/list first. Neither
  App Store Connect nor the Developer Portal had a live session in any
  local browser even after being told ASC was signed in elsewhere --
  Apple's session is apparently per-browser/per-machine, not something
  that follows the Apple ID across devices the way Google's did. Needs
  the same one-time human sign-in as the ASC app record above, on this
  Mac specifically.
- `eas.json` was entirely missing (`eas credentials` refuses to run
  without one) -- added a minimal one.
- `eas-cli` is now installed globally on Atas-Mac-mini (`npm i -g
  eas-cli`) rather than resolved fresh via `npx` every invocation --
  the repeated npx package-resolution (~15-20s and sometimes a fresh
  "Need to install eas-cli, Ok to proceed?" prompt) made scripting the
  interactive `eas credentials` TUI (via `expect`) unreliably slow.

**webmail.altixcode.com had two live production bugs, both fixed**:
1. **No Forgejo webhook existed at all** (`GET
   /repos/AltixCode/omnimail/hooks` returned `[]`), despite Coolify's
   `is_auto_deploy_enabled: true` -- so no push, including the /privacy
   page above, had ever auto-deployed. Created the missing webhook
   (`https://coolify.altixcode.com/webhooks/source/gitea/events/manual`,
   `manual_webhook_secret_gitea` from the app's own config) matching the
   pattern in [[general-saas-forgejo-migration]]. Confirmed working with
   an empty-commit push -> deploy fired -> `/privacy` went live.
2. **The shared Hetzner Postgres container (`etdq0o61ptxliaff8gn0kjo9`)
   was close to exhausting `max_connections`.** Production logs showed
   `Too many database connections opened: ... reserved for roles with
   the SUPERUSER attribute`, breaking omnimail's IMAP IDLE background
   sync for every connected account. Root cause: 38 `postgres`
   (superuser) connections with empty `application_name`, one dating
   back **2 days**, sitting idle and never closed -- not caused by this
   session, source not identified (no `application_name` to go on).
   Killed them via `pg_terminate_backend` (only ones idle >30 min, to
   avoid touching whatever legitimate health-check produces the same
   empty-`application_name` pattern every few seconds). Cluster-wide
   connections dropped from ~93 (against `max_connections=100`) to 58.
   Also capped omnimail's own pool for durability --
   `DATABASE_URL` now carries `&connection_limit=5&pool_timeout=10`
   (Prisma's own recommended fix for this exact error) -- and restarted
   the app; confirmed clean in the fresh boot log, no more Prisma errors.
   **This was a symptom of a shared resource, not an omnimail-only bug**:
   whatever was leaking those 38 superuser connections will very likely
   recur and is worth finding properly rather than just re-killing
   connections when it happens again.

**`Atas-Mac-mini`'s `forgejo-runner` is registered TWICE** -- once as a
root-owned system `LaunchDaemon`
(`/Library/LaunchDaemons/sh.brew.forgejo-runner.plist`) and once as a
per-user `LaunchAgent` (`~/Library/LaunchAgents/...`), both from
`brew services`. The root one is the one actually running (confirmed via
`ps aux`), which is what breaks `pod install` (needs `--allow-root`,
already patched in this repo's `deploy.yml`) and very plausibly explains
the certificate/machine-identity issue in §9 too, since this session's
own local builds as the `ata` user throughout hit neither problem. Fix
(not applied -- editing a root-owned system daemon is a "modify system
settings" action held back regardless of permission granted in chat):
```
sudo brew services stop forgejo-runner   # removes the root LaunchDaemon
brew services start forgejo-runner       # restarts it as the ata user
```
After that, `ps aux | grep forgejo-runner` should show `ata`, not `root`.

## 11. Update (2026-09-28, once signed into App Store Connect)

**Fully working end-to-end now.** With an authenticated ASC/Developer
Portal browser session (the user's own session, running on a different
Mac than this repo's CI -- claude-in-chrome automates whatever Chrome
instance it's paired with, not necessarily the local machine):

- **App Store Connect app record created** via the same `iris/v1/apps`
  browser-fetch trick documented in project memory
  `asc-app-record-creation` -- app id `6817104497`, no display-name
  collision on "OmniMail". Bundle id `com.altixcode.omnimail` (created
  earlier, id `JB5A6BAB24`) already had Push Notifications enabled.
- **Internal TestFlight group created and the tester added**: group
  "Internal Testers" (`6464aeb3-ba1c-470f-9ad7-331eead612a6`,
  `isInternalGroup: true` confirmed on a fresh read), `atasmohammadi@gmail.com`
  attached (betaTester id `5e79a131-9ba7-4a89-85fd-70662bc3fbaf`).
- **iOS CI immediately went fully green end-to-end** (run 20): archive,
  sign, export, upload -- `UPLOAD SUCCEEDED`, build 12 landed as
  `VALID`. Confirmed via `GET /apps/{id}/builds`.
- **Found and fixed why the build didn't auto-attach to the internal
  group despite the CI step existing**: `pip3 install --user pyjwt
  cryptography` in the "Auto-add build to TestFlight Internal Testers"
  step fails on this Mac's Python 3.14 (PEP 668 "externally managed
  environment"), and `continue-on-error: true` swallowed it completely
  -- the job stayed green, the tester saw no build available, and had to
  attach build 12 by hand in the ASC UI. Fixed with
  `--break-system-packages` (same fix as `fb-idb` needed earlier this
  session for the screenshot-automation work).
- **Fixed the "no app icon in App Store Connect" issue**: not a build
  problem -- the app's header icon is pulled from whichever build is
  attached to the *App Store* version slate (Distribution -> iOS App
  Version 1.0 -> Build), which is separate from the TestFlight build
  list and was empty. Attached build 12 there too (Distribution page ->
  Add Build); icon now shows correctly. This does not submit anything
  for review, it only associates the build.
- **iOS push (APNs) key created and uploaded to EAS**: Apple only allows
  downloading a `.p8` once, and since developer.apple.com/authkeys was
  reached from a *different* machine's Chrome, the file downloaded
  there and had to be AirDropped to Atas-Mac-mini
  (`~/Certificates/AuthKey_24T656BH84.p8`) before `eas credentials`
  could pick it up. Key ID `24T656BH84`, environment "Sandbox &
  Production", Team Scoped (all topics) -- fleet-reusable the same way
  the shared iOS distribution cert is. Confirmed assigned via
  `eas credentials` read-back (`Developer Portal ID: 24T656BH84`).
  **Android (FCM V1) push was already done in §10** -- both platforms'
  push notifications are now fully configured.

**What's genuinely still open**: Play Console app record (next week,
per the user).

## 12. Update (2026-09-29): TestFlight bug fixes, screenshots, submission prep, new features

**All 8 outstanding TestFlight feedback items addressed** (5 bugs + 3
feature requests):

1. **Root cause of 2 of the 5 bugs at once**: `react-native-svg` (a
   peer dependency of `lucide-react-native`, used for literally every
   icon in the app) was never a direct dependency and was never linked
   into the iOS build (absent from `Podfile.lock` entirely). Every
   icon -- nav bar back/star/archive/delete, compose Cancel/attachment/
   send, the compose FAB, tab bar icons -- silently rendered nothing,
   in both light and dark mode. Fixed with `npx expo install
   react-native-svg` + `pod install`. This is very likely the real
   story behind "buttons in nav bar not visible" and "cancel button/
   attachment icon missing" -- not a dark-mode-only contrast bug as
   originally guessed.
2. Switch contrast (`settings.tsx`), WebView dynamic height
   (`message/[id].tsx`), and the calendar agenda's today-forward filter
   (`calendar.tsx`) -- all fixed and confirmed visually on-device (see
   §9's original findings for detail on what was wrong).
3. **3 new feature requests, all implemented**: calendar event creation
   (a "+" FAB opens a New Event modal, wired to the existing
   `api.calendar.createEvent`), a rich text compose editor (a
   `react-native-webview` `contentEditable` div + Bold/Italic/
   Underline/bullet-list toolbar via `document.execCommand`, replacing
   the old plain `TextInput` body), and swipeable inbox rows
   (`PanResponder`-based, no new native deps -- swipe left to archive,
   swipe right to delete) plus a batch-select mode with a bottom action
   bar (mark read / archive / delete). See `src/components/
   SwipeableMessageRow.tsx` (new) and the diffs to `index.tsx`,
   `compose.tsx`, `calendar.tsx`.
   - One bug found and fixed during testing: the New Event modal had no
     `KeyboardAvoidingView`, so the Create Event button became
     unreachable behind the keyboard with nothing to scroll to. Fixed
     by wrapping the modal in `KeyboardAvoidingView` (`behavior:
     "padding"` on iOS).

**Remote image privacy, ported from the web app**: messages previously
rendered every `<img>` unconditionally the moment the WebView loaded --
no blocking, no proxy, nothing. Now matches web exactly: images are
blocked by default (a regex swap of `http(s)://` `img src` values for a
placeholder, preserving the original URL, mirroring web's DOMPurify
hook approach but done as a plain string transform before the HTML
reaches the WebView), with a privacy banner offering "Load Images"
(session-only) and "Always load from this sender" (persists via the
same `/api/settings/trusted-senders` backend endpoint the web app
already uses -- so a sender trusted on one platform is trusted on the
other). Added a Trusted Senders management section to `settings.tsx`
(list/add/remove) for parity with the web app's account-modal "images"
tab.

**Critical, unrelated finding during this work -- a real cross-tenant
data leak in `web_apps/omnimail`, fixed and deployed same day**: while
testing with a fresh demo account, its own valid auth token returned a
*different real user's* private inbox from `GET /api/messages`. Root
cause: `GET /api/messages` and 8 other data-access routes (message
detail/batch/send, account detail/test, calendar event detail/invite,
attachment download) never scoped their Prisma queries to the
authenticated user at all -- unlike `accounts`/`folders`/`calendar`
list routes, which already did this correctly via
`getOrCreateDefaultUser(req)`. Any authenticated user could read,
modify or delete any other user's mail/calendar/account credentials,
and send email impersonating any account. All 9 routes fixed same
pattern, `tsc`/`next build` clean, deployed via the normal
Forgejo-webhook path, verified fixed by repeating the exact repro.
Full detail in project memory `omnimail-cross-tenant-idor-fixed` (this
also retroactively corrects the §9/§10 "security finding" above, which
had wrongly guessed this was a client-side stale-session bug -- it
never was).

**Screenshots recaptured at the correct device class**: the
`OmniMail Test iPhone` simulator used for the original `01-login.png`
capture was actually iPhone-16-Pro class (6.3", 1206x2622) rather than
the 6.9" class Apple's screenshot spec requires (1320x2868, iPhone
16/17/18 Pro Max). Created a fresh `iPhone 17 Pro Max` simulator for
this. Final sets, both populated via a seeded demo mail account (see
below) rather than empty-state screens: `store/screenshots/ios-6.9/`
(5 images: inbox, message detail, calendar, settings, compose) and
`store/screenshots/ipad-13/` (4 images, same set minus compose) at
2064x2752 on the existing "iPad Pro 13-inch (M4)" simulator. All 9
uploaded to App Store Connect via `scripts/ship/replace-screenshots.py`
(`APP_IPHONE_67` / `APP_IPAD_PRO_3GEN_129` display types -- the script's
own naming, but the pixel dimensions match Apple's 6.9"/13" specs) and
confirmed `COMPLETE` asset-processing state. **Not submitted for
review**, per instruction.

**Demo account seeded with cosmetic data for screenshots**: the
screenshot account (`demo-mobile-shots@altixcode.com`) had zero
connected mail accounts, so authenticated screens were just empty
states. With the user's explicit go-ahead, added
`prisma/seed-demo-account.mjs` to `web_apps/omnimail` (committed,
idempotent, `syncActive: false` so the IMAP worker never touches the
fake host) and ran it once in the deployed container via Coolify's
`scheduled_tasks` `run_once` action -- gives the account one mail
account, 6 fictional-but-realistic messages, and 3 calendar events.
Fixture data only; the fictional persona ("Jordan Rivera") and sender
domains are all `@example.com`, not real people or companies.

**CI**: pushed straight to `main` (this repo's CI/CD branch) after each
round of fixes; the iOS/Android/TestFlight-upload pipeline is the same
one documented in §9-§11 and needs no changes here.

