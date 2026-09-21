/**
 * Train — the tab you land on, and the one that should cost one tap.
 *
 * §7.1. The old list was cards with three buttons each (edit, delete, start),
 * so the action you take 95% of the time was one third of a row, the same size
 * as the one that deletes your template. And nothing on the row said anything
 * about the session except its name and an exercise count — despite the app
 * holding every kilo you have ever lifted under that name.
 *
 * So: a hero card for what you are most likely to train next, rows for the
 * rest with their body glyphs and their last run on them, and the destructive
 * actions moved behind a swipe where they cannot be hit by accident.
 */
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, StatusBar, Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Colors, Typography, Spacing, Radius, IconSize, Touch, Elevation, onAccent,
} from '../theme';
import { Icon } from '../components/Icon';
import { EmptyState, SkeletonList } from '../components/States';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadSessions, deleteSession, syncSessions } from '../utils/storage';
import { peekPrefs } from '../utils/prefs';
import { supabase } from '../config/supabase';
import { EXERCISE_TYPES } from '../data/exercises';
import {
  shapeSessions, deriveAll, fmtTonnes, fmtDur, dayLabel, SESSION_LIMIT,
} from '../utils/analytics';

const SECTION_ICON = {
  Chest: 'bodyChest', Back: 'bodyBack', Shoulders: 'bodyShoulders',
  'Front Arms': 'bodyArmsFront', 'Back Arms': 'bodyArmsBack',
  Legs: 'bodyLegs', Core: 'bodyCore', Other: 'bodyOther',
  Warmup: 'warmup', Intervals: 'intervals',
};

/** Distinct areas a template covers, in the order they are first trained. */
const getBodyAreas = (exercises) => {
  const areas = [];
  const add = (a) => { if (a && !areas.includes(a)) areas.push(a); };
  exercises?.forEach(ex => {
    if (ex.type === EXERCISE_TYPES.REGULAR)        add(ex.bodySection);
    else if (ex.type === EXERCISE_TYPES.COMBO)     ex.subExercises?.forEach(s => add(s.bodySection));
    else if (ex.type === EXERCISE_TYPES.WARMUP)    add('Warmup');
    else if (ex.type === EXERCISE_TYPES.INTERVALS) add('Intervals');
  });
  return areas;
};

/** Body glyphs for a template, capped so a full-body session stays one line. */
function AreaGlyphs({ areas, size = IconSize.meta, tint = Colors.textMuted, max = 5 }) {
  const shown = areas.slice(0, max);
  const rest  = areas.length - shown.length;
  return (
    <View style={s.glyphRow}>
      {shown.map((a, i) => (
        <Icon key={`${a}-${i}`} name={SECTION_ICON[a] ?? 'bodyOther'} size={size}
              color={a === 'Warmup' ? Colors.warn : a === 'Intervals' ? Colors.ice : tint} />
      ))}
      {rest > 0 ? <Text style={s.glyphMore}>+{rest}</Text> : null}
    </View>
  );
}

export default function SessionListScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [sessions, setSessions]   = useState(null);   // null = first load
  const [history, setHistory]     = useState(null);
  const [deleteTarget, setTarget] = useState(null);
  const [refreshing, setRefresh]  = useState(false);
  const [dialOpen, setDialOpen]   = useState(false);
  const swipeRefs = useRef({});

  /** Last run per template NAME — the only link between a template and its history. */
  const loadHistory = async () => {
    try {
      const { data } = await supabase.from('workout_sessions').select(`
          id, name, started_at, duration_secs, timeline,
          workout_exercises (
            id, parent_id, exercise_type, exercise_name, body_section, status,
            weight_kg, sets_planned, sets_completed, reps, duration_secs, perf_order
          )
        `).order('started_at', { ascending: false }).limit(SESSION_LIMIT);
      if (!data) return {};
      const byName = {};
      // Rows arrive newest first, so the first sighting of a name is its last run.
      for (const d of deriveAll(shapeSessions(data))) {
        if (!byName[d.name]) byName[d.name] = d;
      }
      return byName;
    } catch (e) {
      console.warn('[Train] history lookup failed:', e?.message ?? e);
      return {};
    }
  };

  // Render the cache first so the list is up instantly and works with no
  // connectivity, then reconcile with Supabase in the background.
  useFocusEffect(useCallback(() => {
    let alive = true;
    loadSessions().then(v => { if (alive) setSessions(v); });
    syncSessions().then(v => { if (alive) setSessions(v); });
    loadHistory().then(v => { if (alive) setHistory(v); });
    return () => { alive = false; };
  }, []));

  const onRefresh = async () => {
    setRefresh(true);
    const [list, hist] = await Promise.all([syncSessions(), loadHistory()]);
    setSessions(list); setHistory(hist);
    setRefresh(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSession(deleteTarget.id);
    setSessions(await loadSessions());
    setTarget(null);
  };

  const startSession  = (item) => navigation.navigate('Training', { session: item });
  const editSession   = (item) => navigation.navigate('SessionEditor', { session: item });

  const startQuick = () => {
    setDialOpen(false);
    navigation.navigate('Training', {
      adHoc: true,
      session: {
        id: null,
        name: `Quick Training — ${new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
        exercises: [],
        restTimerSecs: peekPrefs().restTimerSecs,
      },
    });
  };

  const newSession = () => { setDialOpen(false); navigation.navigate('SessionEditor', { session: null }); };

  /**
   * What to put in the hero: the session you have not trained for longest.
   *
   * That is the rotation answer — with Push/Pull/Legs it names the one that is
   * actually due — and for someone who runs a single template it names that
   * template. A session never run sorts as "longest ago", because one you just
   * built and have not tried is exactly the one you are about to.
   */
  const nextUp = useMemo(() => {
    if (!sessions?.length) return null;
    const lastDay = (x) => history?.[x.name]?.dayKey ?? '';   // '' sorts first
    return [...sessions].sort((a, b) => lastDay(a).localeCompare(lastDay(b)))[0];
  }, [sessions, history]);

  const lastRunLine = (item) => {
    const h = history?.[item.name];
    if (!h) return 'Never run';
    const bits = [dayLabel(h.dayKey)];
    if (h.volumeKg > 0)   bits.push(fmtTonnes(h.volumeKg));
    if (h.durationSecs)   bits.push(fmtDur(h.durationSecs));
    return `Last run ${bits.join(' · ')}`;
  };

  // ─── Rows ─────────────────────────────────────────────────────────────────
  const renderRow = ({ item }) => {
    const areas = getBodyAreas(item.exercises);
    const count = item.exercises?.length ?? 0;

    // Edit and delete live behind a swipe so the row itself is one big START.
    const actions = (progress) => {
      const slide = progress.interpolate({
        inputRange: [0, 1], outputRange: [160, 0], extrapolate: 'clamp',
      });
      return (
        <Animated.View style={[s.actions, { transform: [{ translateX: slide }] }]}>
          <TouchableOpacity style={[s.action, s.actionEdit]} activeOpacity={0.8}
            onPress={() => { swipeRefs.current[item.id]?.close(); editSession(item); }}
            accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}>
            <Icon name="edit" size={IconSize.row} color={Colors.text} />
            <Text style={s.actionTxt}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.action, s.actionDelete]} activeOpacity={0.8}
            onPress={() => { swipeRefs.current[item.id]?.close(); setTarget({ id: item.id, name: item.name }); }}
            accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`}>
            <Icon name="trash" size={IconSize.row} color={Colors.danger} />
            <Text style={[s.actionTxt, { color: Colors.danger }]}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

    return (
      <Swipeable
        ref={r => { swipeRefs.current[item.id] = r; }}
        renderRightActions={actions}
        overshootRight={false}
        friction={1.6}
      >
        <TouchableOpacity style={s.row} onPress={() => startSession(item)}
                          activeOpacity={0.75} accessibilityRole="button"
                          accessibilityLabel={`Start ${item.name}`}>
          <View style={{ flex: 1, minWidth: 0, gap: Spacing.xs }}>
            <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
            <AreaGlyphs areas={areas} size={IconSize.meta} />
            <Text style={s.rowMeta} numberOfLines={1}>
              {count} exercise{count === 1 ? '' : 's'} · {lastRunLine(item)}
            </Text>
          </View>
          <Icon name="chevronRight" size={IconSize.row} color={Colors.textMuted} />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  // ─── Hero ─────────────────────────────────────────────────────────────────
  // Returns ELEMENTS, and is called rather than mounted. Passed as a
  // component, a closure defined here is a new type each render, so the
  // hero would remount on every keystroke of the refresh.
  const renderHero = () => {
    if (!nextUp) return null;
    const areas = getBodyAreas(nextUp.exercises);
    return (
      <>
        <Text style={s.section}>Next up</Text>
        <View style={s.hero}>
          <Text style={s.heroName} numberOfLines={2}>{nextUp.name}</Text>
          <AreaGlyphs areas={areas} size={IconSize.section} tint={Colors.text} max={6} />
          <Text style={s.heroMeta}>{lastRunLine(nextUp)}</Text>
          <TouchableOpacity style={s.heroStart} onPress={() => startSession(nextUp)}
                            activeOpacity={0.85} accessibilityRole="button"
                            accessibilityLabel={`Start ${nextUp.name}`}>
            <Icon name="play" size={IconSize.tab} color={onAccent} />
            <Text style={s.heroStartTxt}>START</Text>
          </TouchableOpacity>
        </View>
        {sessions.length > 1 ? <Text style={s.section}>Your sessions</Text> : null}
      </>
    );
  };

  const loading = sessions == null;
  const rest    = nextUp ? (sessions ?? []).filter(x => x.id !== nextUp.id) : (sessions ?? []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      {/* Header. The four-circle cluster that used to live here is gone: the
          dashboard and metrics are tabs now, and the account moved to You. */}
      <View style={[s.header, { paddingTop: insets.top + Spacing.md }]}>
        {/* Long-press the wordmark for the hidden icon proof sheet (Dev → Icons).
            Linked from nowhere else; see src/screens/DevIconsScreen.js. */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
                          onLongPress={() => navigation.navigate('DevIcons')}
                          delayLongPress={800}>
          <Text style={s.title}>Kinetic</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            {loading ? 'Loading…'
              : sessions.length
                ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}`
                : 'Your training sessions'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonList count={4} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="emptySessions"
          title="No sessions yet"
          message="Build a session once and it is two taps away for good."
          actionLabel="Create a session"
          onAction={newSession}
        />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          ListHeaderComponent={renderHero()}
          contentContainerStyle={[s.list, { paddingBottom: 120 }]}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.ember} />
          }
        />
      )}

      {/* ── Speed dial (decision 6) ──────────────────────────────────── */}
      {dialOpen && (
        <TouchableOpacity style={s.dialScrim} activeOpacity={1}
                          onPress={() => setDialOpen(false)} accessible={false} />
      )}
      <View style={s.dial} pointerEvents="box-none">
        {dialOpen && (
          <>
            <TouchableOpacity style={s.dialItem} onPress={startQuick} activeOpacity={0.85}
                              accessibilityRole="button">
              <Text style={s.dialLabel}>Quick session</Text>
              <View style={[s.dialBtn, s.dialQuick]}>
                <Icon name="bolt" size={IconSize.row} color={Colors.gold} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.dialItem} onPress={newSession} activeOpacity={0.85}
                              accessibilityRole="button">
              <Text style={s.dialLabel}>New session</Text>
              <View style={[s.dialBtn, s.dialQuick]}>
                <Icon name="edit" size={IconSize.row} color={Colors.ice} />
              </View>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={[s.dialBtn, s.dialMain]} onPress={() => setDialOpen(o => !o)}
                          activeOpacity={0.85} accessibilityRole="button"
                          accessibilityLabel={dialOpen ? 'Close menu' : 'Create'}>
          <Icon name={dialOpen ? 'close' : 'add'} size={IconSize.tab} color={onAccent} />
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={!!deleteTarget}
        onDismiss={() => setTarget(null)}
        icon="trash"
        iconColor={Colors.danger}
        title="Delete session?"
        message={deleteTarget ? `“${deleteTarget.name}” goes for good. Sessions you have already trained stay in your stats.` : ''}
        dismissLabel="Keep it"
        actions={[{ label: 'Delete', tone: 'danger', onPress: confirmDelete }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.base },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  title:    { ...Typography.h1, color: Colors.ember, letterSpacing: 1 },
  subtitle: { ...Typography.bodySmall, color: Colors.textMuted },

  list:    { padding: Spacing.md, gap: Spacing.sm },
  section: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.md,
             marginBottom: Spacing.xs },

  // ── Hero ────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.line,
    padding: Spacing.lg, gap: Spacing.md,
  },
  heroName:  { ...Typography.h1, color: Colors.text },
  heroMeta:  { ...Typography.bodySmall, color: Colors.textMuted },
  heroStart: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: 64, borderRadius: Radius.md,
    backgroundColor: Colors.ember, ...Elevation.glowEmber,
  },
  heroStartTxt: { ...Typography.h2, color: onAccent, letterSpacing: 1.5 },

  // ── Rows ────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    minHeight: Touch.gym,
  },
  rowName: { ...Typography.h3, color: Colors.text },
  rowMeta: { ...Typography.caption, color: Colors.textMuted },

  glyphRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  glyphMore: { ...Typography.caption, color: Colors.textFaint },

  actions: { flexDirection: 'row', alignItems: 'stretch' },
  action:  { width: 80, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  actionEdit:   { backgroundColor: Colors.raised, borderTopLeftRadius: Radius.lg,
                  borderBottomLeftRadius: Radius.lg },
  actionDelete: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.danger,
                  borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.lg },
  actionTxt: { ...Typography.caption, color: Colors.text },

  // ── Speed dial ──────────────────────────────────────────────────────────
  dialScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,10,0.6)' },
  // Bottom is measured from the screen area, which already stops above the
  // tab bar — and the tab bar owns the safe-area inset (TabBar.js).
  dial:      { position: 'absolute', right: Spacing.md, bottom: Spacing.lg,
               alignItems: 'flex-end', gap: Spacing.sm },
  dialItem:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dialLabel: {
    ...Typography.bodyMedium, color: Colors.text,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full,
  },
  dialBtn: {
    width: Touch.gym, height: Touch.gym, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  dialQuick: { backgroundColor: Colors.raised, borderWidth: 1, borderColor: Colors.line },
  dialMain:  { backgroundColor: Colors.ember, ...Elevation.glowEmber },
});
