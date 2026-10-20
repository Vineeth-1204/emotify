import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useConvexAuth, useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLanguage } from "@/context/LanguageContext";
import {
  getExpoPushToken,
  getPushPermission,
  requestPushPermission,
  rememberRegisteredToken,
  mobileRouteForPushData,
} from "@/utils/notifications";
import { MOBILE_DESTINATION_ROUTES, isNotificationDestination } from "@/common/notificationRoutes";

const EXPLAINED_KEY = "push_permission_explained";
const LAST_HANDLED_KEY = "push_last_handled_response";

/**
 * OS push notifications for the signed-in user:
 *  - permission: explained in-app first, then the system prompt, asked once (never nags);
 *  - registration: the device token is sent to the server after sign-in (re-sent each launch so
 *    a refreshed token or an account switch on a shared phone takes effect);
 *  - taps (app open, background, or launched from a notification): the server re-checks the
 *    caller's access before the app navigates; otherwise the notification centre opens.
 */
export function usePushNotifications() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAuthenticated } = useConvexAuth();
  const registerPushToken = useMutation(api.pushTokens.registerPushToken);
  const openNotification = useMutation(api.notificationCenter.openNotification);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const askWithExplanation = () =>
      new Promise<boolean>((resolve) => {
        Alert.alert(t("notifications.permission.title"), t("notifications.permission.body"), [
          { text: t("notifications.permission.notNow"), style: "cancel", onPress: () => resolve(false) },
          { text: t("notifications.permission.allow"), onPress: () => requestPushPermission().then((s) => resolve(s === "granted")) },
        ]);
      });

    (async () => {
      let permission = await getPushPermission();
      if (permission === "undetermined") {
        const explained = await SecureStore.getItemAsync(EXPLAINED_KEY).catch(() => null);
        if (explained) return;
        await SecureStore.setItemAsync(EXPLAINED_KEY, "1").catch(() => {});
        if (cancelled) return;
        permission = (await askWithExplanation()) ? "granted" : "denied";
      }
      if (permission !== "granted" || cancelled) return;
      const token = await getExpoPushToken();
      if (!token || cancelled) return;
      await registerPushToken({ token, platform: Platform.OS });
      await rememberRegisteredToken(token);
    })().catch((err) => console.warn("[PUSH] Registration skipped:", err instanceof Error ? err.message : err));

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, registerPushToken, t]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handle = async (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const responseId = response.notification.request.identifier;
      if (handled.current.has(responseId)) return;
      handled.current.add(responseId);
      // A cold-start response is reported again on later launches: handle it only once.
      const last = await SecureStore.getItemAsync(LAST_HANDLED_KEY).catch(() => null);
      if (last === responseId) return;
      await SecureStore.setItemAsync(LAST_HANDLED_KEY, responseId).catch(() => {});

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      let route = mobileRouteForPushData(data);
      const notificationId = typeof data?.notificationId === "string" ? data.notificationId : null;
      if (notificationId) {
        try {
          const result = await openNotification({ notificationId: notificationId as Id<"notifications"> });
          route = MOBILE_DESTINATION_ROUTES[isNotificationDestination(result.destination) ? result.destination : "notifications"];
        } catch {
          // Not this account's notification (e.g. shared phone) or no longer accessible.
          route = MOBILE_DESTINATION_ROUTES.notifications;
        }
      }
      if (route) router.push(route as any);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handle(response);
    });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => handle(response))
      .catch(() => {});

    return () => subscription.remove();
  }, [isAuthenticated, openNotification, router]);
}
