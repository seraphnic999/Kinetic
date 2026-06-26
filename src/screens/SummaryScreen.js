import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../theme';

export default function SummaryScreen({ navigation, route }) {
  const { summary } = route.params ?? {};

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.placeholder}>
        <Text style={styles.placeholderIcon}>🏆</Text>
        <Text style={styles.placeholderTitle}>Session Complete!</Text>
        <Text style={styles.placeholderSub}>Summary screen — coming in Phase 4</Text>

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.popToTop()}
          activeOpacity={0.8}
        >
          <Ionicons name="home-outline" size={20} color={Colors.background} />
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.md, padding: Spacing.xl,
  },
  placeholderIcon: { fontSize: 72 },
  placeholderTitle: { ...Typography.h1, color: Colors.gold, textAlign: 'center' },
  placeholderSub: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  homeBtn: {
    marginTop: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md, borderRadius: Radius.full,
  },
  homeBtnText: { ...Typography.h3, color: Colors.background, fontWeight: '700' },
});
