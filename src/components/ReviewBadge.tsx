import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface Props {
  status: ReviewStatus;
  grade?: string;
  size?: 'sm' | 'md';
}

const CONFIG: Record<ReviewStatus, { icon: string; label: string; bg: string; color: string }> = {
  pending:   { icon: '⏳', label: '評審中',   bg: 'rgba(255,184,0,0.15)',  color: '#FFB800' },
  approved:  { icon: '✅', label: '已驗證',    bg: 'rgba(0,200,100,0.15)',  color: '#00C864' },
  rejected:  { icon: '❌', label: '品相不符',  bg: 'rgba(255,60,60,0.15)',  color: '#FF3C3C' },
};

const ReviewBadge: React.FC<Props> = ({ status, grade, size = 'md' }) => {
  const c = CONFIG[status];
  const labelText = grade ? `${c.label} ${grade}` : c.label;
  const isSmall = size === 'sm';

  return (
    <View style={[
      styles.badge,
      { backgroundColor: c.bg },
      isSmall ? styles.badgeSm : styles.badgeMd,
    ]}>
      <Text style={[styles.icon, isSmall ? styles.iconSm : styles.iconMd]}>
        {status === 'pending' ? '⏳' : status === 'approved' ? '✅' : '❌'}
      </Text>
      <Text style={[
        styles.label,
        { color: c.color },
        isSmall ? styles.labelSm : styles.labelMd,
      ]}>
        {labelText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },
  icon: { fontWeight: '600' },
  iconMd: { fontSize: 11 },
  iconSm: { fontSize: 9 },
  label: { fontWeight: '700' },
  labelMd: { fontSize: 11 },
  labelSm: { fontSize: 9 },
});

export default ReviewBadge;