import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

export {
  ALLOWED_NOTIFICATION_ROUTES,
  validateNotificationRoute,
} from "../common/notificationRoutes";

/** Configures notification handlers for foreground delivery */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

/**
 * Registers device for push notifications:
 * - Creates Android notification channels
 * - Requests POST_NOTIFICATIONS permission
 * - Returns the Expo push token if granted
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Notification channels only exist on Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366F1",
    });

    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Daily Check-Ins & Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366F1",
    });
  }

  // Device check: push notifications require a physical device or compatible environment
  const isDevice = Constants.isDevice;
  if (!isDevice && Platform.OS !== "web") {
    console.log("[NOTIFICATIONS] Push notifications require a physical device.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[NOTIFICATIONS] Permission not granted by user.");
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch (error) {
    console.warn("[NOTIFICATIONS] Failed to retrieve Expo push token:", error);
    return null;
  }
}
