import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { EmotyAvatar } from '@/components/avatar/EmotyAvatar';
import { useAvatar } from '@/context/AvatarContext';
import { useThemeColors } from '@/context/MoodThemeContext';
import { Theme } from '@/constants/Theme';
import type { EmotyPresence as EmotyPresenceModel } from '@/common/emotyPresence';

interface EmotyPresenceProps {
  presence: EmotyPresenceModel;
  /** 'row': avatar beside a speech bubble. 'stacked': avatar centred above the line. */
  layout?: 'row' | 'stacked';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Optional actions rendered under the line (row layout). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one way screens show Emoty: the canonical EmotyAvatar (live companion character) plus, when the presence model
 * provides one, a single short line. Screens pass context through getEmotyPresence().
 */
export function EmotyPresence({ presence, layout = 'row', size = 'sm', children, style }: EmotyPresenceProps) {
  const { avatarName, avatarGender } = useAvatar();
  const colors = useThemeColors();
  const { line, avatarState } = presence;

  if (layout === 'stacked') {
    return (
      <View style={[styles.stacked, style]}>
        <EmotyAvatar gender={avatarGender} state={avatarState} size={size} interactive={false} live />
        {line ? (
          <Text
            style={[styles.stackedLine, { color: colors.text }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${avatarName}: ${line}`}
          >
            {line}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
      <EmotyAvatar gender={avatarGender} state={avatarState} size={size} interactive={false} live />
      {line || children ? (
        <View style={styles.bubbleCol}>
          {line ? (
            <View style={[styles.bubble, { backgroundColor: colors.surface }]}>
              <Text
                style={[styles.bubbleText, { color: colors.text }]}
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${avatarName}: ${line}`}
              >
                {line}
              </Text>
            </View>
          ) : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bubbleCol: {
    flex: 1,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  stacked: {
    alignItems: 'center',
    gap: 12,
  },
  stackedLine: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
