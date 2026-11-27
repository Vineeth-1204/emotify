import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { describeError, type PermissionDetails } from "../common/pushRegistration";

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

export const EAS_PROJECT_ID = "4f9d28f2-8302-4f94-8e9d-9f5fc8c2f30c";

export type TokenResult = { ok: true; token: string } | { ok: false; reason: "permission" | "web" | "error"; error: string };

/**
 * The Expo push token for this device (format ExponentPushToken[...]; the backend sends through
 * Expo, which forwards to FCM). Returns why it is unavailable instead of throwing: no permission,
 * no Firebase/FCM configuration in the build ("Default FirebaseApp is not initialized"), no
 * Google Play services, no network.
 */
export async function acquireExpoPushToken(): Promise<TokenResult> {
  if (Platform.OS === "web") return { ok: false, reason: "web", error: "web" };
  try {
    await ensureNotificationChannels();
    const permission = await getPushPermission();
    if (permission !== "granted") return { ok: false, reason: "permission", error: `permission ${permission}` };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? EAS_PROJECT_ID;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenData?.data) return { ok: false, reason: "error", error: "empty token" };
    console.log("[PUSH] Expo push token obtained for project", projectId);
    return { ok: true, token: tokenData.data };
  } catch (error) {
    const message = describeError(error);
    console.error("[PUSH] Push token unavailable:", message);
    return { ok: false, reason: "error", error: message };
  }
}

/** The Expo push token for this device, or null when unavailable (see acquireExpoPushToken). */
export async function getExpoPushToken(): Promise<string | null> {
  const result = await acquireExpoPushToken();
  return result.ok ? result.token : null;
}

/** Permission status plus whether Android will still show its prompt. */
export async function getPushPermissionDetails(): Promise<PermissionDetails> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return {
    status: status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined",
    canAskAgain: canAskAgain !== false,
  };
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
