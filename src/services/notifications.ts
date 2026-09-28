import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";
import { getDeviceToken, setDeviceToken } from "./storage";

export const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
export const EMAIL_NOTIFICATION_CATEGORY = "email_actions";

// Configure foreground notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Configures interactive notification action buttons (Reply, Archive, Mark as Read)
 */
export async function setupNotificationCategoriesAsync(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(EMAIL_NOTIFICATION_CATEGORY, [
      {
        identifier: "mark_read",
        buttonTitle: "Mark as Read",
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: "archive",
        buttonTitle: "Archive",
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: "reply",
        buttonTitle: "Reply",
        options: {
          opensAppToForeground: true,
        },
      },
    ]);
  } catch (err) {
    console.warn("Could not configure notification category:", err);
  }
}

/**
 * Handles actionable responses from rich notifications
 */
export async function handleNotificationActionResponse(
  response: Notifications.NotificationResponse,
  navigate: (path: string) => void
) {
  const actionId = response.actionIdentifier;
  const data = response.notification.request.content.data as any;
  const messageId = data?.messageId;

  if (actionId === "mark_read" && messageId) {
    try {
      await api.messages.update(messageId, { isRead: true });
    } catch (e) {
      console.error("Failed to mark message as read from notification:", e);
    }
  } else if (actionId === "archive" && messageId) {
    try {
      await api.messages.batch([messageId], "archive");
    } catch (e) {
      console.error("Failed to archive message from notification:", e);
    }
  } else if (actionId === "reply" && messageId) {
    navigate(`/compose?inReplyTo=${messageId}`);
  } else if (messageId) {
    navigate(`/message/${messageId}`);
  }
}

export interface PushRegistrationResult {
  granted: boolean;
  token?: string;
  error?: string;
}

/**
 * Requests push notification permissions, obtains Expo push token,
 * and registers it with the OmniMail server.
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default OmniMail Channel",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B82F6",
      sound: "default",
    });
  }

  if (!Device.isDevice) {
    return {
      granted: false,
      error: "Must use physical device for push notifications (simulators lack APNs/FCM tokens)",
    };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return {
      granted: false,
      error: "Push notification permissions not granted",
    };
  }

  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    const token = pushTokenData.data;

    // Register with OmniMail backend
    await api.devices.register({
      token,
      platform: Platform.OS,
      deviceId: Device.modelId || undefined,
      deviceModel: `${Device.manufacturer || ""} ${Device.modelName || ""}`.trim() || undefined,
    });

    await setDeviceToken(token);

    return {
      granted: true,
      token,
    };
  } catch (error: any) {
    console.error("Failed to register push token with OmniMail server:", error);
    return {
      granted: false,
      error: error.message || "Failed to obtain or register push token",
    };
  }
}

/**
 * Unregisters the current device push token from OmniMail server
 */
export async function unregisterDevicePushTokenAsync(): Promise<void> {
  try {
    const token = await getDeviceToken();
    if (token) {
      await api.devices.unregister(token);
      await setDeviceToken(null);
    }
  } catch (error) {
    console.warn("Error unregistering device push token:", error);
  }
}

/**
 * Registers background notification task
 */
export async function registerBackgroundNotificationTask(): Promise<void> {
  try {
    // If Notifications.registerTaskAsync is available in native runtime:
    if (typeof (Notifications as any).registerTaskAsync === "function") {
      await (Notifications as any).registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }
  } catch (error) {
    // Graceful fallback for web/unsupported runtimes
    console.log("Background task registration skipped or not supported on this platform");
  }
}
