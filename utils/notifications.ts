import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export {
  ALLOWED_NOTIFICATION_ROUTES,
  validateNotificationRoute,
  mobileRouteForPushData,
} from "../common/notificationRoutes";

/**
 * OS push notifications (device tray, lock screen, heads-up).
 *
 * Foreground policy: show the banner and add it to the notification list, play the sound, no
 * app-icon badge (the in-app bell shows the unread count from the server). Lock-screen copy is
 * always neutral; details are only inside the app (see convex/notify.ts PUSH_COPY).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android channels. The server's channelId must be one of these. */
export const NOTIFICATION_CHANNELS = {
  default: { name: "General updates", importance: Notifications.AndroidImportance.DEFAULT },
  appointments: { name: "Appointments", importance: Notifications.AndroidImportance.HIGH },
  important: { name: "Important updates", importance: Notifications.AndroidImportance.MAX },
  reminders: { name: "Daily check-ins & reminders", importance: Notifications.AndroidImportance.HIGH },
} as const;

/** Creates (or updates) the Android channels. Must run before a token is requested. */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const [id, channel] of Object.entries(NOTIFICATION_CHANNELS)) {
    await Notifications.setNotificationChannelAsync(id, {
      name: channel.name,
      importance: channel.importance,
      vibrationPattern: [0, 250, 250, 250],
      // Content stays hidden on a locked screen unless the user's system settings allow it.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

export type PushPermission = "granted" | "denied" | "undetermined";

export async function getPushPermission(): Promise<PushPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/** Asks the OS for permission (Android 13+ POST_NOTIFICATIONS). Call after explaining why. */
export async function requestPushPermission(): Promise<PushPermission> {
  await ensureNotificationChannels();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

const STORED_TOKEN_KEY = "push_token";

/**
 * The Expo push token for this device, or null when unavailable (permission not granted, no
 * Firebase/FCM configuration in the build, emulator without Play services, web). Never throws.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    await ensureNotificationChannels();
    if ((await getPushPermission()) !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return tokenData.data;
  } catch (error) {
    console.warn("[NOTIFICATIONS] Push token unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Remembers which token this device registered, so logout can unregister it. */
export async function rememberRegisteredToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(STORED_TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(STORED_TOKEN_KEY);
  } catch {}
}

export async function getRegisteredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORED_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Backwards-compatible helper: permission + token in one call (asks without an explanation).
 * Prefer the explained flow in app/_layout.tsx.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if ((await getPushPermission()) !== "granted" && (await requestPushPermission()) !== "granted") return null;
  return await getExpoPushToken();
}
