// Metro with Sentry's serializer: every bundle gets a debug ID, which ties a crash in a
// release build to the source map CI uploads to Altix ErrorTrack.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
