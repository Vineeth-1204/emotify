import { useCallback, useEffect, useRef } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useConvexAuth, useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLanguage } from "@/context/LanguageContext";
import {
  acquireExpoPushToken,
  getPushPermissionDetails,
  requestPushPermission,
  rememberRegisteredToken,
  mobileRouteForPushData,
} from "@/utils/notifications";
import { MOBILE_DESTINATION_ROUTES, isNotificationDestination } from "@/common/notificationRoutes";
import { describeError, parseOfferedAt, permissionDecision, shouldRegister } from "@/common/pushRegistration";

/** When the permission explanation was last shown (ms). Replaces the old ask-once flag. */
const OFFERED_AT_KEY = "push_permission_offered_at";
const LEGACY_EXPLAINED_KEY = "push_permission_explained";
const LAST_HANDLED_KEY = "push_last_handled_response";
/** Foreground re-checks at most this often. */
const FOREGROUND_CHECK_MS = 60 * 1000;

type SetupHandler = (interactive: boolean) => Promise<void>;
let activeSetupHandler: SetupHandler | null = null;

/**
 * Profile -> "Turn on" / "Try again": run phone-notification setup now, showing the explanation
 * (and the system prompt) even if it was shown recently.
 */
export function requestPushSetup(): Promise<void> {
  return activeSetupHandler ? activeSetupHandler(true) : Promise.resolve();
}

/**
 * OS push notifications for the signed-in user.
 *
 * Registration (device -> Expo push token -> Convex pushTokens):
 *  - runs after sign-in, whenever the app returns to the foreground (so turning notifications on
 *    in phone settings, or a failed attempt on a bad network, recovers without a restart), when
 *    the push token changes, and when the student taps "Turn on" in Profile;
 *  - permission: explained in-app first, then the system prompt; offered again after 3 days if
 *    the student said "Not now" (previously it was asked once per install, ever);
 *  - each step that fails is logged as "[PUSH] ..." and reported to the server
 *    (pushTokens.reportRegistration) so it shows in the Beta report and diagnosePush.
 * Taps (app open, background, or launched from a notification): the server re-checks the
 * caller's access before the app navigates; otherwise the notification centre opens.
 */
export function usePushNotifications() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAuthenticated } = useConvexAuth();
  const registerPushToken = useMutation(api.pushTokens.registerPushToken);
  const reportRegistration = useMutation(api.pushTokens.reportRegistration);
  const openNotification = useMutation(api.notificationCenter.openNotification);
  const handled = useRef(new Set<string>());
  const busy = useRef(false);
  const lastRegistered = useRef<{ token: string; at: number } | null>(null);
  const lastForegroundCheck = useRef(0);

  const askWithExplanation = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (value: boolean) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };
        Alert.alert(
          t("notifications.permission.title"),
          t("notifications.permission.body"),
          [
            { text: t("notifications.permission.notNow"), style: "cancel", onPress: () => done(false) },
            { text: t("notifications.permission.allow"), onPress: () => requestPushPermission().then((s) => done(s === "granted")).catch(() => done(false)) },
          ],
          // Back button or a tap outside must not leave setup waiting forever.
          { cancelable: true, onDismiss: () => done(false) }
        );
      }),
    [t]
  );

  const runSetup = useCallback(
    async (reason: string, options: { interactive?: boolean; force?: boolean } = {}) => {
      if (!isAuthenticated || busy.current || Platform.OS === "web") return;
      busy.current = true;
      const platform = Platform.OS;
      const appVersion = Constants.expoConfig?.version;
      const report = (stage: "permission" | "token" | "backend", status: "denied" | "blocked" | "deferred" | "error", errorCode?: string, permission?: string) => {
        console.warn(`[PUSH] setup (${reason}) stopped at ${stage}: ${status}${errorCode ? ` – ${errorCode}` : ""}`);
        reportRegistration({ stage, status, errorCode, permission, platform, appVersion }).catch(() => {});
      };
      try {
        let permission = await getPushPermissionDetails();
        console.log(`[PUSH] setup (${reason}): permission ${permission.status}`);
        if (permission.status !== "granted") {
          const legacy = await SecureStore.getItemAsync(LEGACY_EXPLAINED_KEY).catch(() => null);
          const stored = (await SecureStore.getItemAsync(OFFERED_AT_KEY).catch(() => null)) ?? (legacy ? "1" : null);
          const decision = permissionDecision({ permission, lastOfferedAt: parseOfferedAt(stored), now: Date.now(), interactive: !!options.interactive });
          if (decision === "blocked") {
            report("permission", "blocked", undefined, permission.status);
            if (options.interactive) {
              Alert.alert(t("notifications.phone.blockedTitle"), t("notifications.phone.blockedBody"), [
                { text: t("notifications.permission.notNow"), style: "cancel" },
                { text: t("notifications.phone.openSettings"), onPress: () => Linking.openSettings().catch(() => {}) },
              ]);
            }
            return;
          }
          if (decision === "wait") {
            report("permission", "deferred", undefined, permission.status);
            return;
          }
          await SecureStore.setItemAsync(OFFERED_AT_KEY, String(Date.now())).catch(() => {});
          const accepted = await askWithExplanation();
          permission = await getPushPermissionDetails();
          if (!accepted || permission.status !== "granted") {
            report("permission", permission.canAskAgain ? "denied" : "blocked", undefined, permission.status);
            return;
          }
        }

        const token = await acquireExpoPushToken();
        if (!token.ok) {
          report("token", "error", token.error, permission.status);
          return;
        }
        if (!shouldRegister({ token: token.token, last: lastRegistered.current, now: Date.now(), force: !!options.force || !!options.interactive })) return;
        try {
          await registerPushToken({ token: token.token, platform, appVersion });
        } catch (error) {
          report("backend", "error", describeError(error), permission.status);
          return;
        }
        lastRegistered.current = { token: token.token, at: Date.now() };
        await rememberRegisteredToken(token.token);
        console.log(`[PUSH] setup (${reason}): device registered`);
      } catch (error) {
        report("token", "error", describeError(error));
      } finally {
        busy.current = false;
      }
    },
    [isAuthenticated, askWithExplanation, registerPushToken, reportRegistration, t]
  );

  // After sign-in (and on every launch while signed in).
  useEffect(() => {
    if (!isAuthenticated) {
      lastRegistered.current = null;
      return;
    }
    void runSetup("sign-in");
  }, [isAuthenticated, runSetup]);

  // Back in the foreground: picks up a permission turned on in phone settings, or retries after
  // a failure (throttled; registration itself is skipped if nothing changed).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || Date.now() - lastForegroundCheck.current < FOREGROUND_CHECK_MS) return;
      lastForegroundCheck.current = Date.now();
      void runSetup("foreground");
    });
    return () => sub.remove();
  }, [runSetup]);

  // The push token can change (Google Play services refresh): register the new one.
  useEffect(() => {
    const sub = Notifications.addPushTokenListener(() => void runSetup("token-refresh", { force: true }));
    return () => sub.remove();
  }, [runSetup]);

  // Profile -> "Turn on" / "Try again".
  useEffect(() => {
    activeSetupHandler = (interactive) => runSetup("profile", { interactive });
    return () => {
      activeSetupHandler = null;
    };
  }, [runSetup]);

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
