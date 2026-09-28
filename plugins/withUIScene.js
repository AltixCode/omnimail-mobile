const {
  withInfoPlist,
  withAppDelegate,
  withXcodeProject,
  withDangerousMod,
  IOSConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Adopts the UIKit scene lifecycle.
 *
 * Apps built against the iOS 26+ SDK must adopt UIScene or they refuse to
 * launch: "Application failed to launch: UIScene life cycle is required for
 * apps built with this SDK." Expo SDK 52 / React Native 0.76 generate the
 * classic Objective-C++ AppDelegate (AppDelegate.mm), which creates its
 * window directly in `didFinishLaunchingWithOptions` rather than waiting for
 * a scene connection, so on Xcode 27 / iOS 27 the app installs and then dies
 * on first launch (confirmed on the "OmniMail Test iPhone" simulator,
 * iOS 27.0).
 *
 * `RCTAppDelegate` already conforms to `UISceneDelegate` and already sets
 * `_window.windowScene.delegate = self` inside `loadReactNativeWindow:` --
 * it just never gets a windowScene-bound window, because nothing implements
 * `application:configurationForConnectingSceneSession:` or creates the
 * window inside a scene callback. This plugin adds the scene manifest, a
 * small SceneDelegate that owns the window, and overrides
 * `loadReactNativeWindow:` to attach the React Native root view to that
 * window instead of creating a second, scene-less one.
 *
 * See mobile_expo_apps/_shared/_template/plugins/withUIScene.js for the
 * equivalent fix on the Swift AppDelegate the newer template apps generate.
 * Remove this plugin once Expo's SDK 52 template adopts scenes itself.
 */

const SCENE_DELEGATE_H = `// Created by the withUIScene config plugin -- see plugins/withUIScene.js.
#import <UIKit/UIKit.h>

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>

@property (nonatomic, strong) UIWindow *window;

@end
`;

const SCENE_DELEGATE_M = `// Created by the withUIScene config plugin -- see plugins/withUIScene.js.
// The iOS 26+ SDK requires scene lifecycle adoption; the window is therefore
// created here, bound to the connecting UIWindowScene, rather than in
// AppDelegate's own \`didFinishLaunchingWithOptions\`.
#import "SceneDelegate.h"
#import "AppDelegate.h"

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  UIWindowScene *windowScene = (UIWindowScene *)scene;
  self.window = [[UIWindow alloc] initWithWindowScene:windowScene];

  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  appDelegate.window = self.window;
  [appDelegate loadReactNativeWindow:appDelegate.launchOptions];
}

@end
`;

/** Scene manifest pointing at the delegate above. */
function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });
}

/**
 * Stops `didFinishLaunchingWithOptions` from eagerly creating a scene-less
 * window, adds the scene-session configuration hook, stores launchOptions
 * for the scene delegate to use, and overrides `loadReactNativeWindow:` to
 * attach the React Native root view to `self.window` (already bound to a
 * UIWindowScene by SceneDelegate) instead of allocating a fresh one via
 * `initWithFrame:`.
 */
function withSceneAwareAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes("automaticallyLoadReactNativeWindow = NO")) {
      contents = contents.replace(
        'self.moduleName = @"main";',
        'self.moduleName = @"main";\n\n  // The SceneDelegate loads the React Native window once a scene connects.\n  self.automaticallyLoadReactNativeWindow = NO;\n  self.launchOptions = launchOptions;',
      );
    }

    if (!contents.includes("configurationForConnectingSceneSession")) {
      const marker = "// Linking API";
      const method = `- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                                   options:(UISceneConnectionOptions *)options
{
  UISceneConfiguration *sceneConfig =
      [[UISceneConfiguration alloc] initWithName:@"Default Configuration"
                                      sessionRole:connectingSceneSession.role];
  sceneConfig.delegateClass = NSClassFromString(@"SceneDelegate");
  return sceneConfig;
}

// Overrides RCTAppDelegate's implementation, which creates a fresh
// scene-less window via initWithFrame:. self.window is already bound to a
// UIWindowScene by SceneDelegate by the time this runs.
- (void)loadReactNativeWindow:(NSDictionary *)launchOptions
{
  UIView *rootView = [self.rootViewFactory viewWithModuleName:self.moduleName
                                            initialProperties:self.initialProps
                                                launchOptions:launchOptions];
  UIViewController *rootViewController = [self createRootViewController];
  [self setRootView:rootView toRootViewController:rootViewController];
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];
}

${marker}`;
      contents = contents.replace(marker, method);
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

/** Declares the `launchOptions` property AppDelegate.mm now reads/writes. */
function withLaunchOptionsProperty(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const name = IOSConfig.XcodeUtils.getProjectName(
        cfg.modRequest.projectRoot,
      );
      const headerPath = path.join(projectRoot, name, "AppDelegate.h");
      let header = fs.readFileSync(headerPath, "utf8");
      if (!header.includes("launchOptions")) {
        header = header.replace(
          "@interface AppDelegate : EXAppDelegateWrapper",
          "@interface AppDelegate : EXAppDelegateWrapper\n\n@property (nonatomic, strong, nullable) NSDictionary *launchOptions;\n\n- (void)loadReactNativeWindow:(nullable NSDictionary *)launchOptions;",
        );
        fs.writeFileSync(headerPath, header);
      }
      return cfg;
    },
  ]);
}

/** Writes SceneDelegate.h/.mm into the iOS project directory. */
function withSceneDelegateFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const name = IOSConfig.XcodeUtils.getProjectName(
        cfg.modRequest.projectRoot,
      );
      const dir = path.join(projectRoot, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SceneDelegate.h"), SCENE_DELEGATE_H);
      fs.writeFileSync(path.join(dir, "SceneDelegate.mm"), SCENE_DELEGATE_M);
      return cfg;
    },
  ]);
}

/** Adds SceneDelegate.mm to the Xcode target so it actually compiles. */
function withSceneDelegateInProject(config) {
  return withXcodeProject(config, (cfg) => {
    const name = IOSConfig.XcodeUtils.getProjectName(
      cfg.modRequest.projectRoot,
    );
    const filePath = `${name}/SceneDelegate.mm`;

    if (!cfg.modResults.hasFile(filePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: name,
        project: cfg.modResults,
      });
    }
    return cfg;
  });
}

module.exports = function withUIScene(config) {
  config = withSceneManifest(config);
  config = withLaunchOptionsProperty(config);
  config = withSceneAwareAppDelegate(config);
  config = withSceneDelegateFiles(config);
  config = withSceneDelegateInProject(config);
  return config;
};
