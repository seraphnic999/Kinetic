import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, StatusBar, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadSessions, saveSessions } from '../utils/storage';

export default function SessionListScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);

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

  const handleStartSession = (session) => {
    navigation.navigate('Training', { session });
  };

  const renderSession = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.sessionName}>{item.name}</Text>
          <Text style={styles.exerciseCount}>
            {item.exercises?.length ?? 0} exercise{item.exercises?.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Exercise preview chips */}
        {item.exercises?.length > 0 && (
          <View style={styles.chipRow}>
            {item.exercises.slice(0, 4).map((ex, idx) => (
              <View key={idx} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {ex.type === 'warmup' ? '🔥 Warmup' :
                   ex.type === 'intervals' ? '⚡ Intervals' :
                   ex.type === 'combo' ? `🔗 ${ex.name}` :
                   ex.name}
                </Text>
              </View>
            ))}
            {item.exercises.length > 4 && (
              <View style={styles.chipMore}>
                <Text style={styles.chipMoreText}>+{item.exercises.length - 4}</Text>
              </View>
            )}
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
          onPress={() => handleStartSession(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={18} color={Colors.background} />
          <Text style={styles.startBtnText}>Start</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
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
    </SafeAreaView>
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
    maxWidth: 140,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  chipMore: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  chipMoreText: {
    ...Typography.caption,
    color: Colors.primary,
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

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    ...Shadows.orange,
  },
  emptyBtnText: {
    ...Typography.h3,
    color: Colors.background,
    fontWeight: '700',
  },
});
