import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, StatusBar, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState([]);
  const { height: windowHeight } = useWindowDimensions();
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  useFocusEffect(
    useCallback(() => {
      loadSessions().then(setSessions);
    }, [])
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const updated = sessions.filter(s => s.id !== deleteTarget.id);
    setSessions(updated);
    await saveSessions(updated);
    setDeleteTarget(null);
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
            onPress={() => setDeleteTarget({ id: item.id, name: item.name })}
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
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View>
          <Text style={styles.headerTitle}>Kinetic</Text>
          <Text style={styles.headerSubtitle}>Your training sessions</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: Colors.surfaceRaised }]}
            onPress={() => navigation.navigate('Dashboard')}
            activeOpacity={0.8}
          >
            <Ionicons name="bar-chart-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: Colors.surfaceRaised }]}
            onPress={() => navigation.navigate('Metrics')}
            activeOpacity={0.8}
          >
            <Ionicons name="scale-outline" size={20} color={Colors.blue} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: Colors.amber }]}
            onPress={() => navigation.navigate('Training', {
              adHoc: true,
              session: {
                id: null,
                name: `Quick Training — ${new Date().toLocaleDateString('en',{month:'short',day:'numeric'})}`,
                exercises: [],
                restTimerSecs: 60,
              },
            })}
            activeOpacity={0.8}
          >
            <Ionicons name="flash-outline" size={20} color={Colors.background} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('SessionEditor', { session: null })}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={26} color={Colors.background} />
          </TouchableOpacity>
        </View>
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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Delete Session?</Text>
            <Text style={styles.confirmMsg}>
              "{deleteTarget.name}" will be permanently deleted.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setDeleteTarget(null)} activeOpacity={0.8}>
                <Text style={styles.confirmCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={confirmDelete} activeOpacity={0.8}>
                <Text style={styles.confirmDeleteTxt}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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

  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  confirmBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.xl, margin: Spacing.xl, gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  confirmTitle: { ...Typography.h2, color: Colors.textPrimary, textAlign: 'center' },
  confirmMsg:   { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  confirmBtns:  { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  confirmCancelBtn: {
    flex: 1, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center',
  },
  confirmCancelTxt: { ...Typography.h3, color: Colors.textSecondary },
  confirmDeleteBtn: {
    flex: 1, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  confirmDeleteTxt: { ...Typography.h3, color: Colors.textPrimary, fontWeight: '700' },
});
