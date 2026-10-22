import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/**
 * Crash and error reporting to Altix ErrorTrack (Sentry-compatible, our own server).
 *
 * Off unless the build was given a DSN (`EXPO_PUBLIC_ERRORTRACK_DSN`, baked into the app
 * config at build time) — a local or unconfigured build reports nothing.
 *
 * What leaves the device: exception type, message and stack trace, device / OS model, app
 * version, and breadcrumbs of navigation and network calls with their query strings
 * stripped (search terms and message ids never leave). No IP address, no user identity,
 * no request or response bodies, no screenshots or session replays, no email content.
 */

const dsn: string | undefined = Constants.expoConfig?.extra?.errortrackDsn || undefined;

export const errorTrackingEnabled = Boolean(dsn);

/** `https://host/api/messages?query=x` → `https://host/api/messages`. */
export function stripQuery(url: unknown): unknown {
  if (typeof url !== "string") return url;
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    beforeBreadcrumb(crumb) {
      // Console output can contain message content; keep it on the device.
      if (crumb.category === "console") return null;
      if (crumb.data?.url) crumb.data.url = stripQuery(crumb.data.url);
      if (crumb.data?.to) crumb.data.to = stripQuery(crumb.data.to);
      if (crumb.data?.from) crumb.data.from = stripQuery(crumb.data.from);
      return crumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        event.request.url = stripQuery(event.request.url) as string | undefined;
        delete event.request.query_string;
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
}

/** Sends one handled test error, to check that reports arrive (Settings → Diagnostics). */
export function sendTestErrorReport(): string | undefined {
  if (!errorTrackingEnabled) return undefined;
  try {
    throw new Error("OmniMail test error report");
  } catch (e) {
    return Sentry.captureException(e);
  }
}

export { Sentry };
