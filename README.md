# OmniMail Mobile

The official React Native mobile companion app for [OmniMail](https://webmail.altixcode.com) — a unified multi-account webmail and calendar platform.

---

## Architecture & Overview

OmniMail Mobile provides an on-device client that communicates with the OmniMail Next.js + PostgreSQL backend using REST APIs and Bearer session tokens (`Authorization: Bearer <session_token>`).

### Technology Stack
- **Framework**: Expo SDK 52, React Native 0.76, Expo Router
- **Language**: TypeScript (`strict: true`, clean typecheck)
- **State & Storage**: React Context + `expo-secure-store` for encrypted session and server tokens
- **Push Notifications**: `expo-notifications`, `expo-device` for APNs/FCM tokens, registration, and deep-link wake-up
- **UI & Icons**: Native theme tokens (Light & Dark mode support), `lucide-react-native`, `date-fns`
- **Email Rendering**: Sandboxed `react-native-webview` with automated theme matching and plaintext fallback

---

## Directory Layout

```
omnimail/
├── app/
│   ├── _layout.tsx           # Root navigation, AuthProvider, ThemeProvider & Push Listeners
│   ├── login.tsx             # Server URL config & Email/Password authentication
│   ├── compose.tsx           # Multi-account email composer modal
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Bottom tab navigator (Inbox, Calendar, Settings)
│   │   ├── index.tsx         # Unified Inbox (filters, search, endless scroll, pull-to-refresh)
│   │   ├── calendar.tsx      # Agenda & Calendar schedule grouped by day
│   │   └── settings.tsx      # Account status, server connection, push test & logout
│   └── message/
│       └── [id].tsx          # Email detail viewer (HTML/text, attachments, reply/archive/trash)
├── src/
│   ├── components/           # Reusable UI (MessageCard, Button, Input, EmptyState)
│   ├── constants/            # Theme tokens (Light/Dark colors, spacing, typography)
│   ├── context/              # AuthContext and ThemeContext
│   ├── services/             # API client, secure storage, push notifications
│   └── types/                # Strict TypeScript domain interfaces
├── app.json
├── package.json
└── tsconfig.json
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npx expo start
```
- Press `i` to open in iOS Simulator.
- Press `a` to open in Android Emulator.
- Scan QR code with Expo Go on a physical device.

### 3. Connecting to the Backend
On first launch, you are prompted to sign in:
- **Default Server**: `https://webmail.altixcode.com`
- **Local Development**: Toggle "Configure Server URL" and enter `http://localhost:3000` (or `http://<lan-ip>:3000` for physical devices).
- Enter your OmniMail credentials to establish a secure session.

---

## Push Notifications

1. **Permission & Token**:
   - In **Settings** tab, toggle "Push Notifications" on.
   - On physical devices, an Expo push token is requested and registered with the server via `POST /api/devices`.
2. **Instant Test Push**:
   - Tap "Send Test Push Notification" in Settings. The server will dispatch a push alert to verify end-to-end delivery.
3. **Notification Tap Navigation**:
   - Tapping any incoming mail alert automatically routes the app directly to `/message/[id]`.

---

## Verification Commands

```bash
# TypeScript verification (0 errors required)
npx tsc --noEmit

# JS Graph bundle verification
npx expo export --platform ios
npx expo export --platform android
```
