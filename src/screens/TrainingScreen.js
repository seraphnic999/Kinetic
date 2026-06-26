import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

export default function TrainingScreen({ navigation, route }) {
  const { session } = route.params ?? {};

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.sessionName} numberOfLines={1}>{session?.name ?? 'Training'}</Text>
        <TouchableOpacity style={styles.endBtn}>
          <Text style={styles.endBtnText}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Placeholder content */}
      <View style={styles.placeholder}>
        <Text style={styles.placeholderIcon}>⚡</Text>
        <Text style={styles.placeholderTitle}>Training Screen</Text>
        <Text style={styles.placeholderSub}>Coming in Phase 3</Text>
        <Text style={styles.placeholderSub}>Session: {session?.name}</Text>
        <Text style={styles.placeholderSub}>{session?.exercises?.length ?? 0} exercises loaded</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: { padding: Spacing.sm },
  sessionName: { ...Typography.h3, color: Colors.textPrimary, flex: 1 },
  endBtn: {
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  endBtnText: { ...Typography.label, color: Colors.textPrimary, textTransform: 'none', fontSize: 15 },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  placeholderIcon: { fontSize: 64 },
  placeholderTitle: { ...Typography.h2, color: Colors.textPrimary },
  placeholderSub: { ...Typography.body, color: Colors.textSecondary },
});
