import type { ExpoConfig } from "expo/config";
import baseConfig from "./app.json";

/**
 * Marketing version and build number.
 *
 * CI computes both from the commit count (see deploy.yml's "Compute Dynamic
 * Version" step) and passes them in as env vars, so a build is traceable to a
 * commit and every upload gets a build number App Store Connect / Play has
 * not seen before. Locally they are absent and the defaults apply, which
 * keeps `expo start` and `expo export` working with no environment set up.
 *
 * `||`, deliberately, not `??` — see mobile_expo_apps/klondo/app.config.ts
 * for why: a GitHub/Forgejo Actions expression for a missing var renders as
 * the empty STRING, which `??` would pass straight through.
 */
const VERSION = process.env.APP_VERSION || baseConfig.expo.version || "1.0.0";
const BUILD = process.env.APP_BUILD || "1";

const config: ExpoConfig = {
  ...(baseConfig.expo as ExpoConfig),
  version: VERSION,
  ios: {
    ...baseConfig.expo.ios,
    buildNumber: BUILD,
  },
  android: {
    ...baseConfig.expo.android,
    versionCode: Number.parseInt(BUILD, 10),
  },
  runtimeVersion: { policy: "appVersion" },
  owner: process.env.EXPO_OWNER || "altixcodes-team",
  extra: {
    ...(baseConfig.expo as ExpoConfig).extra,
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID ||
        (baseConfig.expo as ExpoConfig).extra?.eas?.projectId,
    },
  },
};

export default config;
