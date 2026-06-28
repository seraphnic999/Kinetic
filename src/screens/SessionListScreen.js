import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, StatusBar, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadSessions, saveSessions } from '../utils/storage';
import { EXERCISE_TYPES } from '../data/exercises';

// Derive unique body areas covered by a session's exercises
const getBodyAreas = (exercises) => {
  const areas = new Set();
  exercises?.forEach(ex => {
    if (ex.type === EXERCISE_TYPES.REGULAR && ex.bodySection) {
      areas.add(ex.bodySection);
    } else if (ex.type === EXERCISE_TYPES.COMBO) {
      ex.subExercises?.forEach(sub => {
        if (sub.bodySection) areas.add(sub.bodySection);
      });
    } else if (ex.type === EXERCISE_TYPES.WARMUP) {
      areas.add('🔥 Warmup');
    } else if (ex.type === EXERCISE_TYPES.INTERVALS) {
      areas.add('⚡ Intervals');
    }
  });
  return Array.from(areas);
};

export default function SessionListScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const { height: windowHeight } = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      loadSessions().then(setSessions);
    }, [])
  );

  const handleDelete = (sessionId, sessionName) => {
    Alert.alert(
      'Delete Session',
      `Delete "${sessionName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = sessions.filter(s => s.id !== sessionId);
            setSessions(updated);
            await saveSessions(updated);
          },
        },
      ]
    );
  };

  const renderSession = ({ item }) => {
    const bodyAreas = getBodyAreas(item.exercises);
    return (
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.sessionName}>{item.name}</Text>
            <Text style={styles.exerciseCount}>
              {item.exercises?.length ?? 0} exercise{item.exercises?.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Body area chips */}
          {bodyAreas.length > 0 && (
            <View style={styles.chipRow}>
              {bodyAreas.map((area, idx) => (
                <View key={idx} style={[
                  styles.chip,
                  area === '🔥 Warmup'    && styles.chipWarmup,
                  area === '⚡ Intervals' && styles.chipIntervals,
                ]}>
                  <Text style={styles.chipText} numberOfLines={1}>{area}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('SessionEditor', { session: item })}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.id, item.name)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.danger} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => navigation.navigate('Training', { session: item })}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={18} color={Colors.background} />
            <Text style={styles.startBtnText}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kinetic</Text>
          <Text style={styles.headerSubtitle}>Your training sessions</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('SessionEditor', { session: null })}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={Colors.background} />
        </TouchableOpacity>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏋️</Text>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the + button to create your first training session
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('SessionEditor', { session: null })}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyBtnText}>Create Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={item => item.id}
          renderItem={renderSession}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.primary,
    letterSpacing: 1,
  },
  headerSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.orange,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.card,
  },
  cardContent: {
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sessionName: {
    ...Typography.h3,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  exerciseCount: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  chipWarmup: {
    backgroundColor: `${Colors.amber}33`,
  },
  chipIntervals: {
    backgroundColor: `${Colors.primary}22`,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.danger}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    ...Shadows.orange,
  },
  startBtnText: {
    ...Typography.h3,
    color: Colors.background,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIcon: { fontSize: 64, marginBottom: Spacing.sm },
  emptyTitle: { ...Typography.h2, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: {
    ...Typography.body, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 24,
  },
  emptyBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    ...Shadows.orange,
  },
  emptyBtnText: { ...Typography.h3, color: Colors.background, fontWeight: '700' },
});
