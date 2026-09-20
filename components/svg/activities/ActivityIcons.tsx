import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  fillColor?: string;
  style?: any;
  accessibilityLabel?: string;
}

// Breathing: Rhythmic expanding concentric circles / wind flow
export const BreathingIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#06B6D4',
  style,
  accessibilityLabel = 'Breathing exercise'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#ECFEFF" stroke={color} strokeWidth="2.5" />
    <Circle cx="24" cy="24" r="13" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="3 3" />
    <Circle cx="24" cy="24" r="6" fill={color} />
    {/* Wind breath streams */}
    <Path d="M12 24C16 22 20 22 24 24C28 26 32 26 36 24" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
  </Svg>
);

// Grounding: 5 senses / solid anchor stone / leaf & hand
export const GroundingIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#10B981',
  style,
  accessibilityLabel = 'Grounding exercise'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#F0FDF4" stroke={color} strokeWidth="2.5" />
    {/* Natural grounding leaf & stem */}
    <Path d="M24 12C18 16 16 24 16 34C24 34 32 32 36 26C36 18 30 14 24 12Z" fill="#DCFCE7" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
    <Path d="M24 14V34" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M24 22L19 26" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M24 26L29 30" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// Hydration: Clean water droplet
export const HydrationIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#3B82F6',
  style,
  accessibilityLabel = 'Hydration'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#EFF6FF" stroke={color} strokeWidth="2.5" />
    <Path
      d="M24 12C24 12 15 23 15 28C15 33 19 37 24 37C29 37 33 33 33 28C33 23 24 12 24 12Z"
      fill="#DBEAFE"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <Path d="M20 28C20 25 22 23 24 23" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" fill="none" />
  </Svg>
);

// Stretching: Flexible dynamic figure arc
export const StretchingIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#8B5CF6',
  style,
  accessibilityLabel = 'Stretching'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#FAF5FF" stroke={color} strokeWidth="2.5" />
    {/* Head */}
    <Circle cx="24" cy="15" r="3.5" fill={color} />
    {/* Spine stretch arc */}
    <Path d="M24 20Q22 27 26 34" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* Raised arms */}
    <Path d="M15 22Q20 18 24 20Q28 18 33 22" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {/* Legs */}
    <Path d="M26 34L22 41" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M26 34L30 41" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

// Walking: Gentle footsteps / person in stride
export const WalkingIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#10B981',
  style,
  accessibilityLabel = 'Walking'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#ECFDF5" stroke={color} strokeWidth="2.5" />
    <Circle cx="25" cy="14" r="3.5" fill={color} />
    <Path d="M25 18L23 28L28 32L26 40" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M23 28L18 36" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M19 22L25 24L30 21" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// Journaling: Clean pen and notebook page
export const JournalingIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#F59E0B',
  style,
  accessibilityLabel = 'Journaling'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#FFFBEB" stroke={color} strokeWidth="2.5" />
    <Rect x="15" y="14" width="18" height="22" rx="3" fill="#FEF3C7" stroke={color} strokeWidth="2.5" />
    <Path d="M19 20H29" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M19 25H29" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M19 30H25" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M28 12L34 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

// Talking: Two conversational rounded speech bubbles
export const TalkingIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#EC4899',
  style,
  accessibilityLabel = 'Talking to someone'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#FDF2F8" stroke={color} strokeWidth="2.5" />
    {/* Left speech bubble */}
    <Path
      d="M14 18C14 15 17 13 21 13C25 13 28 15 28 18C28 21 25 23 21 23C19 23 18 24 16 26V23C14.8 21.8 14 20 14 18Z"
      fill="#FCE7F3"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Right speech bubble */}
    <Path
      d="M24 24C24 21.5 26.5 20 30 20C33.5 20 36 21.5 36 24C36 26.5 33.5 28 30 28C28.5 28 27.5 29 26 31V28C24.8 27 24 25.5 24 24Z"
      fill={color}
      stroke={color}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Svg>
);

// Study: Open textbook with calm bookmark
export const StudyIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#6366F1',
  style,
  accessibilityLabel = 'Study balance'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#EEF2FF" stroke={color} strokeWidth="2.5" />
    <Path d="M24 18C21 16 16 16 14 17V33C16 32 21 32 24 34C27 32 32 32 34 33V17C32 16 27 16 24 18Z" fill="#E0E7FF" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
    <Path d="M24 18V34" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

// Sleep: Crescent moon and soft night stars
export const SleepIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#475569',
  style,
  accessibilityLabel = 'Sleep and recovery'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#F1F5F9" stroke={color} strokeWidth="2.5" />
    <Path
      d="M27 15C20 16 16 22 17 29C18 34 22 37 27 37C22 37 18 33 18 28C18 21 23 16 27 15Z"
      fill="#E2E8F0"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <Circle cx="32" cy="18" r="1.5" fill={color} />
    <Circle cx="35" cy="25" r="1.5" fill={color} />
  </Svg>
);

// Hobby: Music notes / creative palette
export const HobbyIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#D97706',
  style,
  accessibilityLabel = 'Hobby or creative activity'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#FEF3C7" stroke={color} strokeWidth="2.5" />
    <Path d="M19 32C17.3 32 16 30.7 16 29C16 27.3 17.3 26 19 26C20.7 26 22 27.3 22 29V17L32 14V26" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Circle cx="19" cy="29" r="3" fill={color} />
    <Circle cx="29" cy="26" r="3" fill={color} />
  </Svg>
);

// Semantic Aliases for compatibility
export const MindfulnessActivityIcon = GroundingIcon;
export const MuscleRelaxActivityIcon = StretchingIcon;
export const JournalActivityIcon = JournalingIcon;
export const HabitMicrogoalIcon = StudyIcon;
export const DeepBreathingActivityIcon = BreathingIcon;

