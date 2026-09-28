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
- `npx expo export --platform ios`: **Pass (3,039 modules bundled, 5.28 MB)**
- `npx expo export --platform android`: **Pass (3,038 modules bundled, 5.28 MB)**
