/**
 * Stats.
 *
 * Everything here answers one of three questions, in this order because that is
 * the order of how much they matter:
 *
 *   1. Am I showing up?       tiles, activity grid
 *   2. Am I getting stronger? records, e1RM progression, volume trend
 *   3. Am I balanced?         body split, lift vs cardio
 *
 * Plus a body strip — three readouts rather than three duplicated charts. Body
 * metrics live on the Body tab, and the dashboard used to quietly show them
 * over a different window (weekly averages over 12 weeks) than the Body tab
 * did (per-day entries over a selectable period). Two truths for one weight.
 *
 * What this replaces: four cumulative stat cards — sessions, total time, active
 * days, kg lifted — capped at the last N sessions, in four unrelated colours.
 * A number that can only go up is not information.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, IconSize, Elevation } from '../theme';
import { Icon } from '../components/Icon';
import { EmptyState, SkeletonList } from '../components/States';
import { ChartCard, BarChart, LineChart } from '../components/Chart';
import { PickerModal, PickerField } from '../components/PickerModal';
import { supabase } from '../config/supabase';
import {
  shapeSessions, deriveAll, computeHeadline, computeCharts, computeProgression,
  computeRecords, computeBodySplit, computeLiftVsCardio, computeBodyStrip,
  buildCalendar, groupByWeek, exerciseDetail,
  fmtDur, fmtTonnes, fmtDelta, fmtVolume, dayLabel,
  WEEKDAY_LABELS, SESSION_LIMIT, CHART_WEEKS,
} from '../utils/analytics';

/** Body section → its glyph. The eight the icon set exists for. */
const SECTION_ICON = {
  Chest: 'bodyChest', Back: 'bodyBack', Shoulders: 'bodyShoulders',
  'Front Arms': 'bodyArmsFront', 'Back Arms': 'bodyArmsBack',
  Legs: 'bodyLegs', Core: 'bodyCore', Other: 'bodyOther',
};

// ─── Headline tiles ───────────────────────────────────────────────────────────

function Tile({ label, value, unit, sub, tone }) {
  return (
    <View style={t.tile}>
      <Text style={t.label}>{label}</Text>
      <Text style={t.value} numberOfLines={1}>
        {value}{unit ? <Text style={t.unit}> {unit}</Text> : null}
      </Text>
      <Text style={[t.sub, tone === 'up' && t.up, tone === 'down' && t.down]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function Headline({ h }) {
  const d = h.sessions.delta;
  const vol = h.volumeKg;
  const ul = h.underLoad;
  const [volValue, volUnit] = fmtTonnes(vol.value).split(' ');
  return (
    <View style={t.grid}>
      <Tile
        label="This week"
        value={h.sessions.value}
        unit={h.sessions.value === 1 ? 'session' : 'sessions'}
        sub={d === 0 ? 'same as last week' : `${d > 0 ? '+' : '−'}${Math.abs(d)} vs last week`}
        tone={d > 0 ? 'up' : d < 0 ? 'down' : null}
      />
      <Tile
        label="Volume" value={volValue} unit={volUnit}
        sub={vol.deltaPct == null ? 'no week to compare' : `${fmtDelta(vol.deltaPct)} vs last week`}
        tone={vol.deltaPct > 0 ? 'up' : vol.deltaPct < 0 ? 'down' : null}
      />
      <Tile
        label="Under load"
        value={ul.workSecs == null ? '—' : fmtDur(ul.workSecs)}
        sub={ul.workSecs != null
          ? `of ${fmtDur(ul.totalSecs)} · ${Math.round(ul.density * 100)}%`
          // "no timed sets yet" read as "this app has never timed a set",
          // when usually it just means the week has not started.
          : h.sessions.value === 0 ? 'no sessions this week' : 'no timed sets'}
      />
      <Tile
        label="Streak" value={h.streak.current}
        unit={h.streak.current === 1 ? 'week' : 'weeks'}
        sub={`best ${h.streak.best}`}
        tone={h.streak.current > 0 ? 'up' : null}
      />
    </View>
  );
}

const t = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, gap: 2, ...Elevation.card,
  },
  label: { ...Typography.label, color: Colors.textFaint },
  value: { ...Typography.statHuge, color: Colors.text },
  unit:  { ...Typography.body, color: Colors.textMuted },
  sub:   { ...Typography.caption, color: Colors.textFaint },
  up:    { color: Colors.gold },
  down:  { color: Colors.warn },
});

// ─── Activity grid ────────────────────────────────────────────────────────────

const LABEL_COL = 46;
const GAP = 4;

/** Cells encode VOLUME, not mere presence — four steps of the person's own range. */
function ActivityGrid({ derived }) {
  const [w, setW] = useState(0);
  const weeks = buildCalendar(derived);
  const grid = Math.max(w - LABEL_COL, 0);
  const cell = grid > 0 ? Math.floor((grid - GAP * 6) / 7) : 0;
  const tint = [null, Colors.emberDim, 'rgba(255,107,43,0.5)', Colors.ember];

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <View style={{ width: LABEL_COL }} />
        {WEEKDAY_LABELS.map((l, i) => (
          <Text key={i} style={[a.head, { width: cell, marginRight: i < 6 ? GAP : 0 }]}>{l}</Text>
        ))}
      </View>
      {cell > 0 && weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: GAP }}>
          <Text style={[a.week, { width: LABEL_COL }]}>{dayLabel(week[0].key)}</Text>
          {week.map((day, di) => (
            <View
              key={di}
              style={{
                width: cell, height: cell, borderRadius: 4,
                marginRight: di < 6 ? GAP : 0,
                backgroundColor: day.level ? tint[day.level] : Colors.raised,
                opacity: day.future ? 0.25 : 1,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
const a = StyleSheet.create({
  head: { ...Typography.caption, color: Colors.textFaint, textAlign: 'center' },
  week: { ...Typography.caption, color: Colors.textFaint },
});

// ─── Records ──────────────────────────────────────────────────────────────────

function Records({ records, onOpen }) {
  return (
    <View style={{ gap: Spacing.xs }}>
      {records.map((r, i) => (
        <TouchableOpacity key={`${r.exercise}-${r.dayKey}-${i}`} style={rc.row}
                          onPress={() => onOpen(r.exercise)} activeOpacity={0.8}>
          <Icon name="trophy" size={IconSize.meta} color={Colors.gold} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={rc.name} numberOfLines={1}>{r.exercise}</Text>
            <Text style={rc.meta} numberOfLines={1}>
              {r.e1rm} kg e1RM · {r.weightKg}×{r.reps}
              {r.gain != null ? ` · +${r.gain} since ${dayLabel(r.sinceDayKey)}` : ' · first record'}
            </Text>
          </View>
          <Icon name="chevronRight" size={IconSize.pip} color={Colors.gold} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
const rc = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.goldDim, borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,201,60,0.22)',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  name: { ...Typography.h3, color: Colors.text },
  meta: { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
});

// ─── Body split ───────────────────────────────────────────────────────────────

function BodySplit({ split }) {
  const max = split[0]?.pct || 1;
  return (
    <View style={{ gap: Spacing.sm }}>
      {split.map(s => {
        // The uncomfortable one earns a colour: under a tenth of your volume is
        // the number actually worth seeing.
        const low = s.pct < 10;
        return (
          <View key={s.section} style={bs.row}>
            <Icon
              name={SECTION_ICON[s.section] ?? 'bodyOther'}
              size={IconSize.meta}
              color={low ? Colors.warn : Colors.textMuted}
            />
            <Text style={bs.name} numberOfLines={1}>{s.section}</Text>
            <View style={bs.track}>
              <View style={[bs.fill, {
                width: `${Math.max(2, (s.pct / max) * 100)}%`,
                backgroundColor: low ? Colors.warn : Colors.ember,
              }]} />
            </View>
            <Text style={[bs.pct, low && { color: Colors.warn }]}>{s.pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}
const bs = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name:  { ...Typography.bodySmall, color: Colors.textMuted, width: 84 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.raised, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 4 },
  pct:   { ...Typography.caption, color: Colors.textMuted, width: 34, textAlign: 'right' },
});

// ─── Body strip ───────────────────────────────────────────────────────────────

function BodyStrip({ strip, onPress }) {
  const cells = [
    strip.weight && { icon: 'scale', label: 'Weight', value: strip.weight.value, unit: 'kg',
                      delta: strip.weight.delta, days: strip.weight.days, better: 'down' },
    strip.waist && { icon: 'tape', label: 'Waist', value: strip.waist.value, unit: 'cm',
                     delta: strip.waist.delta, days: strip.waist.days, better: 'down' },
    strip.diet && { icon: 'diet', label: 'Diet', value: strip.diet.value, unit: '%',
                    sub: `${strip.diet.days}d avg` },
  ].filter(Boolean);

  if (!cells.length) return null;

  return (
    <TouchableOpacity style={st.strip} onPress={onPress} activeOpacity={0.8}
                      accessibilityRole="button" accessibilityLabel="Open the Body tab">
      {cells.map(c => {
        const good = c.delta != null && c.delta !== 0 && ((c.better === 'down') === (c.delta < 0));
        const bad  = c.delta != null && c.delta !== 0 && !good;
        return (
          <View key={c.label} style={st.cell}>
            <Icon name={c.icon} size={IconSize.meta} color={Colors.textMuted} />
            <Text style={st.label}>{c.label}</Text>
            <Text style={st.value}>{c.value}<Text style={st.unit}>{c.unit}</Text></Text>
            <Text style={[st.sub, good && { color: Colors.gold }, bad && { color: Colors.warn }]}>
              {c.sub ?? (c.delta == null
                ? `${c.days}d`
                : `${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)} · ${c.days}d`)}
            </Text>
          </View>
        );
      })}
    </TouchableOpacity>
  );
}
const st = StyleSheet.create({
  strip: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, ...Elevation.card,
  },
  cell:  { flex: 1, alignItems: 'center', gap: 2 },
  label: { ...Typography.label, color: Colors.textFaint },
  value: { ...Typography.metric, color: Colors.text, fontSize: 20 },
  unit:  { ...Typography.caption, color: Colors.textMuted },
  sub:   { ...Typography.caption, color: Colors.textFaint },
});

// ─── Session rows ─────────────────────────────────────────────────────────────

const STATUS = {
  complete: ['statusComplete', Colors.gold],
  partial:  ['statusPartial',  Colors.warn],
};

function SessionRow({ session, derived, expanded, onPress }) {
  return (
    <TouchableOpacity style={sr.card} onPress={onPress} activeOpacity={0.8}>
      <View style={sr.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={sr.name} numberOfLines={1}>{session.name}</Text>
          <Text style={sr.meta} numberOfLines={1}>
            {dayLabel(derived.dayKey)} · {fmtDur(derived.durationSecs)}
            {derived.volumeKg > 0 ? ` · ${fmtVolume(derived.volumeKg)}kg` : ''}
            {derived.workSecs != null ? ` · ${fmtDur(derived.workSecs)} under load` : ''}
          </Text>
        </View>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={IconSize.meta} color={Colors.textMuted} />
      </View>

      {expanded && (session.exercises ?? []).length > 0 && (
        <View style={sr.body}>
          {session.exercises.map((e, i) => {
            const [icon, tint] = STATUS[e.status] ?? ['statusPending', Colors.textFaint];
            return (
              <View key={i}>
                <View style={sr.exRow}>
                  <Icon name={icon} size={IconSize.pip} color={tint} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={sr.exName} numberOfLines={1}>{e.exercise_name}</Text>
                    {e.body_section ? <Text style={sr.exSub}>{e.body_section}</Text> : null}
                  </View>
                  <Text style={sr.exDetail}>{exerciseDetail(e)}</Text>
                </View>
                {/* Combo children, indented under the parent they belong to */}
                {(e.children ?? []).map((ch, j) => (
                  <View key={j} style={[sr.exRow, sr.childRow]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={sr.childName} numberOfLines={1}>{ch.exercise_name}</Text>
                    </View>
                    <Text style={sr.exDetail}>{exerciseDetail(ch)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}
    </TouchableOpacity>
  );
}
const sr = StyleSheet.create({
  card:   { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, ...Elevation.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name:   { ...Typography.h3, color: Colors.text },
  meta:   { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  body:   { marginTop: Spacing.md, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: Spacing.md },
  exRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  childRow:  { paddingLeft: Spacing.xl, marginTop: 4 },
  exName:    { ...Typography.bodySmall, color: Colors.text },
  childName: { ...Typography.caption, color: Colors.textMuted },
  exSub:     { ...Typography.caption, color: Colors.warn },
  exDetail:  { ...Typography.caption, color: Colors.textMuted },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [shaped, setShaped] = useState([]);
  const [derived, setDerived] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;

      const [{ data: raw }, { data: metricRows }] = await Promise.all([
        supabase.from('workout_sessions').select(`
            id, name, started_at, duration_secs, timeline,
            workout_exercises (
              id, parent_id, exercise_type, exercise_name, body_section, status,
              weight_kg, sets_planned, sets_completed, reps, duration_secs,
              intervals_planned, intervals_done, perf_order,
              cardio_type, speed_kmh, incline_pct
            )
          `).order('started_at', { ascending: false }).limit(SESSION_LIMIT),
        supabase.from('body_metrics')
          .select('week_date, weight_kg, waist_cm, diet_pct')
          .eq('user_id', auth.user.id)
          .order('week_date', { ascending: true }).limit(400),
      ]);

      if (raw) {
        const s = shapeSessions(raw);
        setShaped(s);
        setDerived(deriveAll(s));
      }
      if (metricRows) setMetrics(metricRows);
    } catch (e) {
      console.warn('[Stats] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  // §7.7: skeleton rows, not a centred spinner. A lone spinner on a near-black
  // screen with no chrome is indistinguishable from a screen that has failed.
  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.base }}>
      <SkeletonList count={5} lines={2} />
    </View>
  );

  const hasData = derived.length > 0;
  const headline = hasData ? computeHeadline(derived) : null;
  const charts   = hasData ? computeCharts(derived) : null;
  const records  = hasData ? computeRecords(derived, 4) : [];
  const split    = hasData ? computeBodySplit(derived) : [];
  const lc       = hasData ? computeLiftVsCardio(derived) : null;
  const strip    = computeBodyStrip(metrics);
  const weeks    = hasData ? groupByWeek(derived).slice(0, 4) : [];

  const selected = exercise ?? charts?.exerciseNames?.[0] ?? null;
  const progression = selected ? computeProgression(derived, selected) : [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.base }}>
      <View style={[ds.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={ds.title}>Stats</Text>
      </View>

      <ScrollView
        contentContainerStyle={[ds.content, { paddingBottom: Spacing.xxl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={Colors.ember}
                          onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        {!hasData ? (
          <EmptyState
            icon="emptyChart"
            title="Nothing to measure yet"
            message="Finish a session and your numbers appear here."
          />
        ) : (
          <>
            {/* 1 — Am I showing up? */}
            <Headline h={headline} />

            <ChartCard title="Activity" icon="calendar" subtitle="last 10 weeks">
              <ActivityGrid derived={derived} />
            </ChartCard>

            {/* 2 — Am I getting stronger? */}
            {records.length > 0 && (
              <>
                <Text style={ds.section}>Records</Text>
                <Records records={records}
                         onOpen={name => navigation.navigate('ExerciseDetail', { exercise: name })} />
              </>
            )}

            <Text style={ds.section}>Progress</Text>

            <ChartCard
              title="Estimated 1RM" icon="trendUp" subtitle={selected ?? undefined}
              right={selected ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('ExerciseDetail', { exercise: selected })}
                  accessibilityRole="button" accessibilityLabel={`Open ${selected}`}>
                  <Icon name="chevronRight" size={IconSize.meta} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : undefined}
              empty={!selected || progression.length < 2}
              emptyHint={selected ? `Need two sessions with ${selected}.` : 'No lifting data yet.'}
            >
              {charts.exerciseNames.length > 0 && (
                <View style={{ marginBottom: Spacing.md }}>
                  <PickerField label="Exercise" value={selected} placeholder="Select exercise…"
                               onPress={() => setPicking(true)} />
                </View>
              )}
              {progression.length >= 2 && (
                <>
                  <LineChart
                    data={progression}
                    secondary={progression.map(p => ({ ...p, value: p.raw }))}
                    color={Colors.ember}
                    format={v => String(Math.round(v))}
                  />
                  <Text style={ds.note}>
                    Solid: estimated 1RM. Dashed: the heaviest set it came from.
                  </Text>
                </>
              )}
            </ChartCard>

            <ChartCard
              title="Volume" icon="tonnage" subtitle={`${CHART_WEEKS} weeks · 4-week avg`}
              empty={charts.volumeData.every(d => d.value === 0)}
            >
              <BarChart data={charts.volumeData} overlay={charts.volumeAvgData}
                        color={Colors.ember} format={v => fmtVolume(v)} />
            </ChartCard>

            <ChartCard
              title="Frequency" icon="chartBar" subtitle="sessions per week"
              empty={charts.freqData.every(d => d.value === 0)}
            >
              <BarChart data={charts.freqData} color={Colors.ice}
                        format={v => String(Math.round(v))} />
            </ChartCard>

            {/* 3 — Am I balanced? */}
            <Text style={ds.section}>Balance</Text>

            <ChartCard title="Body split" icon="compare" subtitle="last 4 weeks"
                       empty={split.length === 0}>
              <BodySplit split={split} />
            </ChartCard>

            {lc && (lc.liftSecs > 0 || lc.cardioSecs > 0) && (
              <ChartCard title="Lifting vs cardio" icon="cardio" subtitle="last 4 weeks">
                <View style={ds.lcTrack}>
                  <View style={[ds.lcFill, { flex: Math.max(lc.liftPct, 1), backgroundColor: Colors.ember }]} />
                  <View style={[ds.lcFill, { flex: Math.max(100 - lc.liftPct, 1), backgroundColor: Colors.ice }]} />
                </View>
                <View style={ds.lcRow}>
                  <Text style={ds.lcTxt}>Lifting {fmtDur(lc.liftSecs)}</Text>
                  <Text style={[ds.lcTxt, { color: Colors.ice }]}>
                    Cardio {fmtDur(lc.cardioSecs)}{lc.cardioKm > 0 ? ` · ${lc.cardioKm}km` : ''}
                  </Text>
                </View>
              </ChartCard>
            )}

            {/* Body — one strip, one window, tapping through to the Body tab */}
            <Text style={ds.section}>Body</Text>
            <BodyStrip strip={strip} onPress={() => navigation.navigate('Body')} />

            {/* History, grouped by week */}
            <Text style={ds.section}>History</Text>
            {weeks.map(week => (
              <View key={week.key} style={{ gap: Spacing.sm }}>
                <View style={ds.weekHead}>
                  <Text style={ds.weekLabel}>{week.label}</Text>
                  <Text style={ds.weekMeta}>
                    {week.count} session{week.count === 1 ? '' : 's'} · {fmtTonnes(week.volumeKg)}
                  </Text>
                </View>
                {week.sessions.map(d => {
                  const session = shaped.find(s => s.id === d.id);
                  if (!session) return null;
                  return (
                    <SessionRow
                      key={d.id} session={session} derived={d}
                      expanded={expanded === d.id}
                      onPress={() => setExpanded(x => (x === d.id ? null : d.id))}
                    />
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <PickerModal
        visible={picking}
        title="Select exercise"
        options={charts?.exerciseNames ?? []}
        selected={selected}
        onSelect={setExercise}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

const ds = StyleSheet.create({
  header:  { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.line },
  title:   { ...Typography.h1, color: Colors.text },
  content: { padding: Spacing.md, gap: Spacing.sm },
  section: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.lg },
  note:    { ...Typography.caption, color: Colors.textFaint, marginTop: Spacing.sm },

  weekHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.sm },
  weekLabel: { ...Typography.label, color: Colors.textMuted },
  weekMeta:  { ...Typography.caption, color: Colors.textFaint },

  lcTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  lcFill:  { height: '100%' },
  lcRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  lcTxt:   { ...Typography.caption, color: Colors.ember },

  empty:      { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { ...Typography.h3, color: Colors.textMuted },
  emptyTxt:   { ...Typography.bodySmall, color: Colors.textFaint, textAlign: 'center' },
});
