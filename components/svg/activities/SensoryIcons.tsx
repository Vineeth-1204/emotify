import React from 'react';
import Svg, { Path, Circle, Rect, Ellipse } from 'react-native-svg';

interface SensoryIconProps {
  size?: number;
  color?: string;
  fillColor?: string;
  style?: any;
}

// 5: SEE (Gentle open eye)
export const SeeIcon: React.FC<SensoryIconProps> = ({ size = 28, color = '#3B82F6', fillColor = '#EFF6FF', style }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel="See">
    <Circle cx="24" cy="24" r="20" fill={fillColor} stroke={color} strokeWidth="2.5" />
    <Path d="M12 24C16 18 32 18 36 24C32 30 16 30 12 24Z" fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
    <Circle cx="24" cy="24" r="5" fill={color} />
    <Circle cx="26" cy="22" r="1.5" fill="#FFFFFF" />
  </Svg>
);

// 4: TOUCH (Open supportive hand)
export const TouchIcon: React.FC<SensoryIconProps> = ({ size = 28, color = '#10B981', fillColor = '#ECFDF5', style }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel="Touch">
    <Circle cx="24" cy="24" r="20" fill={fillColor} stroke={color} strokeWidth="2.5" />
    {/* Palm and fingers */}
    <Path
      d="M19 28V19C19 17.5 21 17.5 21 19V26M21 21V16C21 14.5 23 14.5 23 16V26M23 21V17C23 15.5 25 15.5 25 17V26M25 23V20C25 18.5 27 18.5 27 20V29C27 34 23 37 19 37C15 37 13 33 13 30L15 26C16 24 19 25 19 28Z"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// 3: HEAR (Soundwave / ear)
export const HearIcon: React.FC<SensoryIconProps> = ({ size = 28, color = '#F59E0B', fillColor = '#FFFBEB', style }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel="Hear">
    <Circle cx="24" cy="24" r="20" fill={fillColor} stroke={color} strokeWidth="2.5" />
    <Path d="M19 18C16 21 16 27 19 30M16 15C12 20 12 28 16 33M24 16C28 16 30 19 30 23C30 28 27 29 27 32" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <Circle cx="26" cy="34" r="1.5" fill={color} />
  </Svg>
);

// 2: SMELL (Soft floral aroma / fragrance breeze)
export const SmellIcon: React.FC<SensoryIconProps> = ({ size = 28, color = '#EC4899', fillColor = '#FDF2F8', style }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel="Smell">
    <Circle cx="24" cy="24" r="20" fill={fillColor} stroke={color} strokeWidth="2.5" />
    <Circle cx="24" cy="24" r="4" fill="#F472B6" />
    <Path d="M24 15C24 18 20 18 20 21C20 23 22 24 24 24C26 24 28 23 28 21C28 18 24 18 24 15Z" fill="#FBCFE8" stroke={color} strokeWidth="1.5" />
    <Path d="M33 24C30 24 30 20 27 20C25 20 24 22 24 24C24 26 25 28 27 28C30 28 30 24 33 24Z" fill="#FBCFE8" stroke={color} strokeWidth="1.5" />
    <Path d="M24 33C24 30 28 30 28 27C28 25 26 24 24 24C22 24 20 25 20 27C20 30 24 30 24 33Z" fill="#FBCFE8" stroke={color} strokeWidth="1.5" />
    <Path d="M15 24C18 24 18 28 21 28C23 28 24 26 24 24C24 22 23 20 21 20C18 20 18 24 15 24Z" fill="#FBCFE8" stroke={color} strokeWidth="1.5" />
  </Svg>
);

// 1: TASTE (Wholesome mint leaf / water sip)
export const TasteIcon: React.FC<SensoryIconProps> = ({ size = 28, color = '#8B5CF6', fillColor = '#FAF5FF', style }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" style={style} accessibilityLabel="Taste">
    <Circle cx="24" cy="24" r="20" fill={fillColor} stroke={color} strokeWidth="2.5" />
    <Path
      d="M24 14C24 14 16 23 16 27C16 31.4 19.6 35 24 35C28.4 35 32 31.4 32 27C32 23 24 14 24 14Z"
      fill="#DDD6FE"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <Path d="M24 20V32" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// Sensory Aliases for compatibility
export const SightSensoryIcon = SeeIcon;
export const TouchSensoryIcon = TouchIcon;
export const SoundSensoryIcon = HearIcon;
export const SmellSensoryIcon = SmellIcon;
export const TasteSensoryIcon = TasteIcon;

