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

