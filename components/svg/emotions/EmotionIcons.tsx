import React from 'react';
import Svg, { Circle, Path, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  fillColor?: string;
  style?: any;
  accessibilityLabel?: string;
}

// E01 - Happy: Uplifting, warm smile, gentle eyes
export const HappyIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#EAB308',
  fillColor = '#FEF9C3',
  style,
  accessibilityLabel = 'Happy emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Expressive curved eyes */}
    <Path d="M15 20C16.5 17 19.5 17 21 20" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    <Path d="M27 20C28.5 17 31.5 17 33 20" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* Soft cheeks */}
    <Circle cx="14" cy="26" r="3" fill="#FDE047" opacity="0.6" />
    <Circle cx="34" cy="26" r="3" fill="#FDE047" opacity="0.6" />
    {/* Open joyous smile */}
    <Path d="M16 27C18 34 30 34 32 27" stroke={color} strokeWidth="3" strokeLinecap="round" fill="#FACC15" />
  </Svg>
);

// E02 - Calm: Serene closed eyes, peaceful gentle curve
export const CalmIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#10B981',
  fillColor = '#ECFDF5',
  style,
  accessibilityLabel = 'Calm emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Soft serene resting eyes */}
    <Path d="M14 22C16 25 20 25 22 22" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    <Path d="M26 22C28 25 32 25 34 22" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* Gentle contented smile */}
    <Path d="M18 29C21 32 27 32 30 29" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
  </Svg>
);

// E03 - Sad: Downward gentle tilt, soft compassionate expression
export const SadIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#3B82F6',
  fillColor = '#EFF6FF',
  style,
  accessibilityLabel = 'Sad emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Soft angled eyebrows */}
    <Path d="M14 17L21 19" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M34 17L27 19" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    {/* Gentle rounded eyes */}
    <Circle cx="18" cy="23" r="2.5" fill={color} />
    <Circle cx="30" cy="23" r="2.5" fill={color} />
    {/* Soft downturned mouth */}
    <Path d="M18 33C21 30 27 30 30 33" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
  </Svg>
);

// E04 - Worried: Caution brow, attentive eyes, slight tension line
export const WorriedIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#F97316',
  fillColor = '#FFF7ED',
  style,
  accessibilityLabel = 'Worried or scared emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Worried raised inner brows */}
    <Path d="M15 18C18 16 21 18 21 19" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <Path d="M33 18C30 16 27 18 27 19" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {/* Wide attentive eyes */}
    <Circle cx="18" cy="23" r="3" fill={color} />
    <Circle cx="30" cy="23" r="3" fill={color} />
    {/* Slightly wavy/tense mouth */}
    <Path d="M18 31Q21 28 24 31Q27 34 30 31" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
  </Svg>
);

// E05 - Angry: Firm brow, determined steady line
export const AngryIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#EF4444',
  fillColor = '#FEF2F2',
  style,
  accessibilityLabel = 'Angry or frustrated emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Slanted firm brows */}
    <Path d="M14 17L22 21" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <Path d="M34 17L26 21" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Firm eyes */}
    <Circle cx="18" cy="24" r="2.5" fill={color} />
    <Circle cx="30" cy="24" r="2.5" fill={color} />
    {/* Resolute mouth */}
    <Path d="M18 32H30" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

// E06 - Embarrassed / Ashamed: Blushing cheeks, looking down
export const EmbarrassedIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#A855F7',
  fillColor = '#FAF5FF',
  style,
  accessibilityLabel = 'Embarrassed or self-conscious emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Soft shy curved eyes looking down */}
    <Path d="M15 22C17 24 20 24 21 22" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <Path d="M27 22C28 24 31 24 33 22" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {/* Warm blush marks */}
    <Circle cx="13" cy="26" r="4" fill="#F472B6" opacity="0.4" />
    <Circle cx="35" cy="26" r="4" fill="#F472B6" opacity="0.4" />
    {/* Modest small straight smile */}
    <Path d="M21 30C23 31 25 31 27 30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

// E07 - Guilty / Regretful: Downturned brow, inward reflective expression
export const GuiltyIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#6366F1',
  fillColor = '#EEF2FF',
  style,
  accessibilityLabel = 'Guilty or regretful emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Curved soft troubled brow */}
    <Path d="M15 19C18 18 20 20 21 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <Path d="M33 19C30 18 28 20 27 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {/* Small downward gaze */}
    <Circle cx="18" cy="24" r="2" fill={color} />
    <Circle cx="30" cy="24" r="2" fill={color} />
    {/* Small pursed mouth */}
    <Path d="M20 31Q24 29 28 31" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
  </Svg>
);

// E08 - Tired / Drained: Heavy resting eyelids, quiet resting mouth
export const TiredIcon: React.FC<IconProps> = ({
  size = 32,
  color = '#64748B',
  fillColor = '#F8FAFC',
  style,
  accessibilityLabel = 'Tired or drained emotion'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="22" fill={fillColor} stroke={color} strokeWidth="3" />
    {/* Drooping resting eyes */}
    <Path d="M14 23H22" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <Path d="M26 23H34" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Relaxed oval mouth */}
    <Circle cx="24" cy="31" r="3" fill="none" stroke={color} strokeWidth="2.5" />
  </Svg>
);

// Semantic Aliases for compatibility
export const HappyEmotionIcon = HappyIcon;
export const CalmEmotionIcon = CalmIcon;
export const SadEmotionIcon = SadIcon;
export const WorriedEmotionIcon = WorriedIcon;
export const AngryEmotionIcon = AngryIcon;
export const EmbarrassedEmotionIcon = EmbarrassedIcon;
export const GuiltyEmotionIcon = GuiltyIcon;
export const TiredEmotionIcon = TiredIcon;

export function renderEmotionIcon(emotionCodeOrId: string, size: number = 32, style?: any) {
  const normalized = (emotionCodeOrId || '').toLowerCase();
  switch (normalized) {
    case 'e01':
    case 'happy':
      return <HappyIcon size={size} style={style} />;
    case 'e02':
    case 'calm':
      return <CalmIcon size={size} style={style} />;
    case 'e03':
    case 'sad':
    case 'sadness':
      return <SadIcon size={size} style={style} />;
    case 'e04':
    case 'worried':
    case 'anxiety':
      return <WorriedIcon size={size} style={style} />;
    case 'e05':
    case 'angry':
    case 'anger':
      return <AngryIcon size={size} style={style} />;
    case 'e06':
    case 'embarrassed':
      return <EmbarrassedIcon size={size} style={style} />;
    case 'e07':
    case 'guilty':
      return <GuiltyIcon size={size} style={style} />;
    case 'e08':
    case 'tired':
      return <TiredIcon size={size} style={style} />;
    default:
      return <CalmIcon size={size} style={style} />;
  }
}


