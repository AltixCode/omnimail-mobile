const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Raises every pod target's iOS deployment target to the app's own.
 *
 * Xcode 27 refuses to build a target whose IPHONEOS_DEPLOYMENT_TARGET is below
 * 15.0 -- an error, not the old warning. Sentry Cocoa's podspec still declares
 * iOS 11, so its resource-bundle target `Sentry-Sentry` stopped the release
 * archive: "The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to
 * 11.0, but the range of supported deployment target versions is 15.0 to
 * 27.1.x. (in target 'Sentry-Sentry' from project 'Pods')". Any pod with an
 * old floor would do the same, so this lifts all of them, never lowers one.
 *
 * Remove once every pod in the tree declares iOS 15 or later.
 */

const MARKER = "# withPodsDeploymentTarget";
const SNIPPET = `
    ${MARKER} -- see plugins/withPodsDeploymentTarget.js
    app_target = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new(app_target)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_target
        end
      end
    end
`;

function addPodsDeploymentTarget(podfile) {
  if (podfile.includes(MARKER)) return podfile;
  const anchor =
    /(post_install do \|installer\|\n\s*react_native_post_install\([\s\S]*?\n\s*\)\n)/;
  if (!anchor.test(podfile)) {
    throw new Error(
      "withPodsDeploymentTarget: react_native_post_install(...) not found in the Podfile",
    );
  }
  return podfile.replace(anchor, (match) => match + SNIPPET);
}

const withPodsDeploymentTarget = (config) =>
  withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      fs.writeFileSync(
        file,
        addPodsDeploymentTarget(fs.readFileSync(file, "utf8")),
      );
      return cfg;
    },
  ]);

module.exports = withPodsDeploymentTarget;
module.exports.addPodsDeploymentTarget = addPodsDeploymentTarget;
