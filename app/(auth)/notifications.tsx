import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useThemeColors } from "@/context/MoodThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { MOBILE_DESTINATION_ROUTES, isNotificationDestination } from "@/common/notificationRoutes";
import { notificationIcon, relativeTime } from "@/common/notificationCentre";
import { Theme } from "@/constants/Theme";

const PAGE_SIZE = 20;

/**
 * In-app notification centre: the persistent history of the user's notifications (the server
 * record), independent of the device tray. Opening one marks it read and goes where the server
 * says the user may go now.
 */
export default function NotificationsScreen() {
  return (
    <CentreErrorBoundary>
      <NotificationCentre />
    </CentreErrorBoundary>
  );
}

function NotificationCentre() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useLanguage();
  const { results, status, loadMore } = usePaginatedQuery(api.notificationCenter.listMine, {}, { initialNumItems: PAGE_SIZE });
  const unread = useQuery(api.notificationCenter.unreadCount, {});
  const markAllRead = useMutation(api.notificationCenter.markAllRead);
  const openNotification = useMutation(api.notificationCenter.openNotification);
  const [opening, setOpening] = useState<string | null>(null);
  const now = Date.now();

  const open = async (id: Id<"notifications">) => {
    if (opening) return;
    setOpening(String(id));
    try {
      const { destination } = await openNotification({ notificationId: id });
      const target = isNotificationDestination(destination) ? destination : "notifications";
      if (target !== "notifications") router.push(MOBILE_DESTINATION_ROUTES[target] as any);
    } catch {
      // The notification stays in the list; the read state did not change.
    } finally {
      setOpening(null);
    }
  };

  const markAll = async () => {
    // Batches of 200 on the server; repeat while more remain.
    for (let i = 0; i < 10; i++) {
      const res = await markAllRead({}).catch(() => null);
      if (!res?.remaining) break;
    }
  };

  const when = (createdAt: number) => {
    const rel = relativeTime(createdAt, now);
    return rel.key === "date" ? new Date(createdAt).toLocaleDateString() : t(rel.key, { count: rel.count });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {t("notifications.centre.title")}
        </Text>
        {unread && unread.count > 0 ? (
          <TouchableOpacity onPress={markAll} accessibilityRole="button" style={styles.markAll}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>{t("notifications.centre.markAllRead")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.markAll} />
        )}
      </View>

      {status === "LoadingFirstPage" ? (
        <View style={styles.center} accessibilityLabel={t("notifications.centre.loading")}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t("notifications.centre.empty")}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(n) => String(n._id)}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => status === "CanLoadMore" && loadMore(PAGE_SIZE)}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => open(item._id)}
              disabled={opening === String(item._id)}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? "" : t("notifications.centre.unread") + ", "}${item.title}. ${item.message}`}
              style={[
                styles.item,
                { backgroundColor: item.read ? colors.surface : colors.primary + "12", borderColor: item.read ? "#E2E8F0" : colors.primary + "40" },
              ]}
            >
              <Ionicons name={notificationIcon(item.type) as any} size={22} color={item.read ? colors.textSecondary : colors.primary} />
              <View style={styles.itemBody}>
                <View style={styles.itemTop}>
                  <Text style={[styles.itemTitle, { color: colors.text, fontFamily: item.read ? Theme.fontFamily.medium : Theme.fontFamily.bold }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.read && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.itemMessage, { color: colors.textSecondary }]} numberOfLines={3}>
                  {item.message}
                </Text>
                <Text style={[styles.itemTime, { color: colors.textSecondary }]}>{when(item.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            status === "LoadingMore" ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : status === "CanLoadMore" ? (
              <TouchableOpacity onPress={() => loadMore(PAGE_SIZE)} style={styles.loadMore} accessibilityRole="button">
                <Text style={{ color: colors.primary, fontFamily: Theme.fontFamily.medium }}>{t("notifications.centre.loadMore")}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

/** A failed load shows a calm message with a retry instead of crashing the app. */
class CentreErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return <CentreError onRetry={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))} />;
  }
}

function CentreError({ onRetry }: { onRetry: () => void }) {
  const colors = useThemeColors();
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
      <Ionicons name="cloud-offline-outline" size={36} color={colors.textSecondary} />
      <Text style={[styles.empty, { color: colors.textSecondary }]}>{t("notifications.centre.error")}</Text>
      <TouchableOpacity onPress={onRetry} style={[styles.retry, { borderColor: colors.primary }]} accessibilityRole="button">
        <Text style={{ color: colors.primary, fontFamily: Theme.fontFamily.bold }}>{t("notifications.centre.retry")}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }} accessibilityRole="button">
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md },
  back: { padding: 4, marginRight: 8 },
  title: { flex: 1, fontFamily: Theme.fontFamily.bold, fontSize: 22 },
  markAll: { minWidth: 90, alignItems: "flex-end" },
  markAllText: { fontFamily: Theme.fontFamily.medium, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Theme.spacing.xl, gap: 12 },
  empty: { fontFamily: Theme.fontFamily.medium, fontSize: 15, lineHeight: 22, textAlign: "center" },
  list: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 48, gap: 10 },
  item: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  itemBody: { flex: 1, gap: 4 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { flex: 1, fontSize: 15 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  itemMessage: { fontFamily: Theme.fontFamily.medium, fontSize: 14, lineHeight: 20 },
  itemTime: { fontFamily: Theme.fontFamily.medium, fontSize: 12 },
  loadMore: { alignItems: "center", paddingVertical: 16 },
  retry: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
});
