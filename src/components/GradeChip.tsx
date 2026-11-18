/**
 * The badge that says a card is graded, and by whom.
 *
 * A slabbed card is worth a different amount from the same card raw,
 * so the grade travels with the listing and the buyer sees it before
 * they bid. The certification number is shown too — a buyer can check
 * it with the grader.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GradingInfo } from '../types';
import { GRADE_CHIP, GRADE_LABEL } from '../utils/gradeHelper';
import { C, themed } from '../theme';

export default function GradeChip({
  grading,
  showCert = false,
}: {
  grading?: GradingInfo | null;
  showCert?: boolean;
}) {
  const styles = themed(makeStyles);
  if (!grading || grading.grade === 'raw') return null;

  const chip = GRADE_CHIP[grading.grade] ?? GRADE_CHIP.raw;
  const label = GRADE_LABEL[grading.grade] ?? grading.grade;

  return (
    <View style={[styles.chip, { backgroundColor: chip.bg, borderColor: chip.border }]}>
      <Text style={[styles.label, { color: chip.text }]}>{label}</Text>
      {showCert && grading.certNumber ? (
        <Text style={styles.cert}>#{grading.certNumber}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginTop: 4,
    },
    label: { fontSize: 11, fontWeight: '800' },
    cert: { fontSize: 10.5, color: C.textTertiary, fontWeight: '600' },
  });
