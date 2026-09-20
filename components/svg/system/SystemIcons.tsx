import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop, G, Ellipse } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  style?: any;
  accessibilityLabel?: string;
}

// Visual Calm Point Token: Warm golden calm coin/token
export const CalmPointToken: React.FC<IconProps & { points?: number }> = ({
  size = 28,
  points,
  style,
  accessibilityLabel = 'Calm Point'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Defs>
      <LinearGradient id="calmGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#FDE047" />
        <Stop offset="100%" stopColor="#EAB308" />
      </LinearGradient>
      <LinearGradient id="calmInner" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#FEF08A" />
        <Stop offset="100%" stopColor="#CA8A04" />
      </LinearGradient>
    </Defs>
    <Circle cx="24" cy="24" r="22" fill="url(#calmGrad)" stroke="#A16207" strokeWidth="2" />
    <Circle cx="24" cy="24" r="16" fill="url(#calmInner)" stroke="#CA8A04" strokeWidth="1.5" />
    {/* Concentric peaceful lotus / droplet emblem */}
    <Path
      d="M24 14C24 14 18 21 18 25C18 28.3 20.7 31 24 31C27.3 31 30 28.3 30 25C30 21 24 14 24 14Z"
      fill="#FEF9C3"
      stroke="#A16207"
      strokeWidth="1.5"
    />
  </Svg>
);

// Progress World: Growing plant stages (seed -> sprout -> plant -> garden)
export const PlantProgress: React.FC<{ stage: 'seed' | 'sprout' | 'plant' | 'garden'; size?: number }> = ({
  stage = 'sprout',
  size = 36
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel={`Calm garden: ${stage}`}>
    {/* Soil pot / ground mound */}
    <Path d="M14 38C14 34 34 34 34 38C34 42 14 42 14 38Z" fill="#D97706" opacity="0.3" />
    <Path d="M16 38H32L30 44H18L16 38Z" fill="#B45309" stroke="#92400E" strokeWidth="1.5" />

    {stage === 'seed' && (
      <Circle cx="24" cy="35" r="4" fill="#92400E" />
    )}

    {stage === 'sprout' && (
      <G>
        <Path d="M24 38V26" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />
        <Path d="M24 26C20 22 17 24 18 28C21 28 23 27 24 26Z" fill="#4ADE80" stroke="#16A34A" strokeWidth="1.5" />
        <Path d="M24 28C28 24 31 26 30 30C27 30 25 29 24 28Z" fill="#22C55E" stroke="#16A34A" strokeWidth="1.5" />
      </G>
    )}

    {stage === 'plant' && (
      <G>
        <Path d="M24 38V18" stroke="#15803D" strokeWidth="3" strokeLinecap="round" />
        <Path d="M24 26C18 20 14 22 15 28C19 28 22 27 24 26Z" fill="#4ADE80" stroke="#15803D" strokeWidth="1.5" />
        <Path d="M24 22C30 16 34 18 33 24C29 24 26 23 24 22Z" fill="#22C55E" stroke="#15803D" strokeWidth="1.5" />
        <Path d="M24 18C21 13 27 13 24 18Z" fill="#86EFAC" stroke="#15803D" strokeWidth="1.5" />
      </G>
    )}

    {stage === 'garden' && (
      <G>
        <Path d="M24 38V16" stroke="#15803D" strokeWidth="3" strokeLinecap="round" />
        <Path d="M19 38V24" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />
        <Path d="M29 38V22" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />
        {/* Soft flowers on top */}
        <Circle cx="24" cy="14" r="5" fill="#F472B6" />
        <Circle cx="24" cy="14" r="2.5" fill="#FDE047" />
        <Circle cx="19" cy="22" r="4" fill="#60A5FA" />
        <Circle cx="29" cy="20" r="4" fill="#A78BFA" />
      </G>
    )}
  </Svg>
);

// Safety / Shield Icon for serious supportive states
export const ShieldSafetyIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#2563EB',
  style,
  accessibilityLabel = 'Safety and support'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Path
      d="M24 6L11 12V24C11 32.5 16.5 40 24 42C31.5 40 37 32.5 37 24V12L24 6Z"
      fill="#EFF6FF"
      stroke={color}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <Path d="M24 16V26" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <Circle cx="24" cy="32" r="2" fill={color} />
  </Svg>
);

// Counsellor Badge Icon
export const CounsellorBadgeIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#4F46E5',
  style,
  accessibilityLabel = 'Counsellor support'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#EEF2FF" stroke={color} strokeWidth="2.5" />
    <Circle cx="24" cy="18" r="5" fill={color} />
    <Path d="M14 34C14 28 18 26 24 26C30 26 34 28 34 34" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    <Path d="M30 14L36 20" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// Success Badge Icon (non-punitive completion)
export const SuccessBadgeIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#10B981',
  style,
  accessibilityLabel = 'Completed'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#ECFDF5" stroke={color} strokeWidth="2.5" />
    <Path d="M16 24L22 30L32 18" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// Reminder Icon (gentle timer / notification)
export const ReminderIcon: React.FC<IconProps> = ({
  size = 28,
  color = '#64748B',
  style,
  accessibilityLabel = 'Reminder'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Circle cx="24" cy="24" r="20" fill="#F8FAFC" stroke={color} strokeWidth="2.5" />
    <Circle cx="24" cy="24" r="14" fill="none" stroke={color} strokeWidth="2.5" />
    <Path d="M24 16V24L29 27" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Empty State Icon (peaceful zen stone cairn)
export const EmptyStateIcon: React.FC<IconProps> = ({
  size = 48,
  color = '#94A3B8',
  style,
  accessibilityLabel = 'Empty state'
}) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel={accessibilityLabel}>
    <Ellipse cx="24" cy="38" rx="14" ry="5" fill="#E2E8F0" stroke={color} strokeWidth="2" />
    <Ellipse cx="24" cy="29" rx="10" ry="4" fill="#CBD5E1" stroke={color} strokeWidth="2" />
    <Ellipse cx="24" cy="21" rx="7" ry="3" fill="#94A3B8" stroke={color} strokeWidth="2" />
    <Circle cx="24" cy="14" r="3" fill="#64748B" />
  </Svg>
);
