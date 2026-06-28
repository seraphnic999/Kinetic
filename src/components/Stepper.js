import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../theme';

/**
 * Numeric stepper with +/- buttons and editable input.
 * size='normal' (editor) | 'large' (training — big touch targets for gym use)
 */
export function Stepper({ value, onChange, min = 0, max = 999, label, size = 'normal', readOnly = false }) {
  const L = size === 'large';
  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, L && styles.labelLarge]}>{label}</Text>}
      <View style={[styles.row, L && styles.rowLarge]}>
        <TouchableOpacity
          style={[styles.btn, L && styles.btnLarge]}
          onPress={() => !readOnly && onChange(Math.max(min, value - 1))}
          activeOpacity={readOnly ? 1 : 0.7}
        >
          <Ionicons name="remove" size={L ? 26 : 20} color={readOnly ? Colors.textMuted : Colors.textPrimary} />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, L && styles.inputLarge]}
          value={String(value)}
          onChangeText={t => {
            if (readOnly) return;
            const n = parseInt(t, 10);
            if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          editable={!readOnly}
        />

        <TouchableOpacity
          style={[styles.btn, L && styles.btnLarge]}
          onPress={() => !readOnly && onChange(Math.min(max, value + 1))}
          activeOpacity={readOnly ? 1 : 0.7}
        >
          <Ionicons name="add" size={L ? 26 : 20} color={readOnly ? Colors.textMuted : Colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1 },
  label: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.xs },
  labelLarge: { fontSize: 15, marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, overflow: 'hidden',
  },
  rowLarge: { borderRadius: Radius.lg },
  btn:      { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnLarge: { width: 56, height: 60 },
  input: {
    width: 56, height: 44, textAlign: 'center',
    ...Typography.h3, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  inputLarge: {
    width: 76, height: 60,
    ...Typography.h2, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
});
