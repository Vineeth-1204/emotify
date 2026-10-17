import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useConvexConnectionState } from 'convex/react';
import { useRouter } from 'expo-router';
import { api } from '@/convex/_generated/api';
import { useThemeColors } from '@/context/MoodThemeContext';
import { useLanguage } from '@/context/LanguageContext';
import { Theme } from '@/constants/Theme';
import { myCounsellorView } from '@/common/myCounsellorState';

interface MyCounsellorSectionProps {
  isReady: boolean;
}

/**
 * "My Counsellor" on the student profile. Reads the signed-in student's own assignment
 * (counsellorAssignments.getMyCounsellor takes no student argument) and updates live when
 * an administrator assigns or reassigns them. Shows only the counsellor's display name,
 * role and institution-approved directory contacts; never clinical data or internal ids.
 */
export const MyCounsellorSection: React.FC<MyCounsellorSectionProps> = (props) => (
  <MyCounsellorErrorBoundary>
    <MyCounsellorContent {...props} />
  </MyCounsellorErrorBoundary>
);

function MyCounsellorContent({ isReady }: MyCounsellorSectionProps) {
  const colors = useThemeColors();
  const { t } = useLanguage();
  const router = useRouter();
  const result = useQuery(api.counsellorAssignments.getMyCounsellor, isReady ? {} : 'skip');
  const connection = useConvexConnectionState();

  const view = myCounsellorView(isReady, result, connection);
  if (view === 'hidden') return null;

  let body: React.ReactNode;
  if (view === 'offline') {
    body = <Notice icon="cloud-offline-outline" text={t('profile.myCounsellor.loadError')} color={colors.textSecondary} />;
  } else if (view === 'loading' || result === undefined) {
    body = (
      <View style={styles.centerRow} accessibilityLabel={t('profile.myCounsellor.loading')}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('profile.myCounsellor.loading')}</Text>
      </View>
    );
  } else if (view === 'signInAgain') {
    body = <Notice icon="lock-closed-outline" text={t('profile.myCounsellor.signInAgain')} color={colors.textSecondary} />;
  } else if (view === 'unassigned') {
    body = <Notice icon="person-outline" text={t('profile.myCounsellor.unassigned')} color={colors.textSecondary} />;
  } else if (view === 'unavailable' || result.status !== 'assigned') {
    body = <Notice icon="time-outline" text={t('profile.myCounsellor.unavailable')} color={colors.textSecondary} />;
  } else {
    const { counsellor, assignedAt } = result;
    body = (
      <View>
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="person" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} accessibilityRole="header">{counsellor.displayName}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.roleBadge, { backgroundColor: colors.primary + '14' }]}>
                <Text style={[styles.roleText, { color: colors.primary }]}>{t('profile.myCounsellor.role')}</Text>
              </View>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                {t('profile.myCounsellor.assignedSince', { date: new Date(assignedAt).toLocaleDateString([], { dateStyle: 'medium' }) })}
              </Text>
            </View>
          </View>
        </View>
        {counsellor.email ? (
          <ContactRow icon="mail-outline" label={t('profile.myCounsellor.email')} value={counsellor.email} onPress={() => Linking.openURL(`mailto:${counsellor.email}`)} colors={colors} />
        ) : null}
        {counsellor.phone ? (
          <ContactRow icon="call-outline" label={t('profile.myCounsellor.phone')} value={counsellor.phone} onPress={() => Linking.openURL(`tel:${counsellor.phone}`)} colors={colors} />
        ) : null}
        <TouchableOpacity
          style={[styles.action, { backgroundColor: colors.primary + '14' }]}
          onPress={() => router.push('/(auth)/tools/appointments' as any)}
          accessibilityRole="button"
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>{t('profile.myCounsellor.requestSession')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('profile.myCounsellor.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.white }]}>{body}</View>
    </View>
  );
}

function Notice({ icon, text, color }: { icon: any; text: string; color: string }) {
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.noticeText, { color }]}>{text}</Text>
    </View>
  );
}

function ContactRow({ icon, label, value, onPress, colors }: { icon: any; label: string; value: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity style={styles.contactRow} onPress={onPress} accessibilityRole="link" accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.contactValue, { color: colors.primary }]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

/** Keeps an unexpected failure in this section from taking down the whole profile screen. */
class MyCounsellorErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <MyCounsellorFallback />;
    return this.props.children;
  }
}

function MyCounsellorFallback() {
  const colors = useThemeColors();
  const { t } = useLanguage();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('profile.myCounsellor.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Notice icon="alert-circle-outline" text={t('profile.myCounsellor.loadError')} color={colors.textSecondary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Theme.spacing.xl },
  sectionTitle: { fontFamily: Theme.fontFamily.bold, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: Theme.spacing.md },
  card: { borderRadius: Theme.borderRadius.lg, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)', padding: Theme.spacing.md, ...Theme.shadows.tertiary },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { fontFamily: Theme.fontFamily.medium, fontSize: 12, flexShrink: 1 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeText: { flex: 1, fontFamily: Theme.fontFamily.medium, fontSize: 14, lineHeight: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Theme.fontFamily.bold, fontSize: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleText: { fontFamily: Theme.fontFamily.bold, fontSize: 11 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: Theme.spacing.md },
  contactLabel: { fontFamily: Theme.fontFamily.medium, fontSize: 13, width: 52 },
  contactValue: { flex: 1, fontFamily: Theme.fontFamily.bold, fontSize: 13 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Theme.spacing.md, paddingVertical: 10, borderRadius: 10 },
  actionText: { fontFamily: Theme.fontFamily.bold, fontSize: 13 },
});
