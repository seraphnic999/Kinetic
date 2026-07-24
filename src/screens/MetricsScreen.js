import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { supabase } from '../config/supabase';

// ─── Week / period helpers ────────────────────────────────────────────────────
function getWeekMonday(d = new Date()) {
  const date = new Date(d);
  const day  = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function shortDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function getLastNWeeks(n) {
  const weeks = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weeks.push(getWeekMonday(d));
  }
  return weeks;
}

const PERIODS = [
  { key: '1M',  label: '1 Month',   weeks: 5  },
  { key: '6M',  label: '6 Months',  weeks: 26 },
  { key: '12M', label: '12 Months', weeks: 52 },
];

// ─── Line chart (pure View, onLayout) ────────────────────────────────────────
function MetricLineChart({ data, color, domain }) {
  const [w, setW] = useState(0);
  if (!data?.length) return null;

  const HEIGHT = 110;
  const DOT    = 7;
  const PAD    = DOT;

  const values = data.map(d => d.value);
  const min    = domain?.[0] ?? Math.min(...values);
  const max    = domain?.[1] ?? Math.max(...values);
  const range  = Math.max(max - min, 0.01);

  const pts = w > 0 ? data.map((d, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (w - 2 * PAD),
    y: PAD + ((max - d.value) / range) * (HEIGHT - 2 * PAD),
    ...d,
  })) : [];

  const every = data.length > 10 ? Math.ceil(data.length / 6) : 1;

  return (
    <View>
      <View style={{ height: HEIGHT }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && pts.slice(0, -1).map((p, i) => {
          const n = pts[i + 1];
          const dx = n.x - p.x, dy = n.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <View key={`l${i}`} style={{
              position: 'absolute',
              left: (p.x + n.x) / 2 - len / 2,
              top:  (p.y + n.y) / 2 - 1.5,
              width: len, height: 3,
              backgroundColor: color + '70',
              transform: [{ rotate: `${ang}deg` }],
            }} />
          );
        })}
        {w > 0 && pts.map((p, i) => (
          <View key={`d${i}`} style={{
            position: 'absolute',
            left: p.x - DOT / 2, top: p.y - DOT / 2,
            width: DOT, height: DOT, borderRadius: DOT / 2,
            backgroundColor: color,
            borderWidth: 2, borderColor: Colors.background,
          }} />
        ))}
        {w > 0 && <>
          <Text style={[lc.axisLabel, { top: PAD - 8 }]}>{Number.isInteger(max) ? max : max.toFixed(1)}</Text>
          <Text style={[lc.axisLabel, { bottom: 4 }]}>{Number.isInteger(min) ? min : min.toFixed(1)}</Text>
        </>}
      </View>
      {w > 0 && (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {data.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {i % every === 0 && <Text style={lc.xLabel}>{shortDate(d.week_date)}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
const lc = StyleSheet.create({
  axisLabel: { position: 'absolute', right: 0, fontSize: 8, color: Colors.textMuted },
  xLabel:    { fontSize: 8, color: Colors.textMuted },
});

// ─── Chart card ───────────────────────────────────────────────────────────────
function ChartCard({ title, icon, color, data, unit, domain, latest }) {
  if (!data?.length) return null;
  return (
    <View style={cc.card}>
      <View style={cc.header}>
        <Ionicons name={icon} size={15} color={color} />
        <Text style={cc.title}>{title}</Text>
        {latest != null && <Text style={[cc.latest, { color }]}>{latest}{unit}</Text>}
      </View>
      <MetricLineChart data={data} color={color} domain={domain} />
    </View>
  );
}
const cc = StyleSheet.create({
  card:   { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, ...Shadows.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title:  { ...Typography.label, color: Colors.textSecondary, flex: 1, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  latest: { ...Typography.h3, fontWeight: '700' },
});

// ─── Metric input row ─────────────────────────────────────────────────────────
function MetricInput({ label, value, onChange, unit, placeholder, decimal, max }) {
  return (
    <View style={mi.row}>
      <Text style={mi.label}>{label}</Text>
      <View style={mi.wrap}>
        <TextInput
          style={mi.input}
          value={value}
          onChangeText={t => {
            let s = decimal ? t.replace(/[^0-9.]/g, '') : t.replace(/[^0-9]/g, '');
            const parts = s.split('.');
            if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
            if (decimal && parts[1]?.length > 1) s = parts[0] + '.' + parts[1].slice(0, 1);
            if (max != null && parseFloat(s) > max) s = String(max);
            onChange(s);
          }}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          selectTextOnFocus
        />
      </View>
      <Text style={mi.unit}>{unit}</Text>
    </View>
  );
}
const mi = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { ...Typography.body, color: Colors.textPrimary, width: 62 },
  wrap:  { flex: 1, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md },
  input: { height: 44, paddingHorizontal: Spacing.md, ...Typography.h3, color: Colors.textPrimary, textAlign: 'center' },
  unit:  { ...Typography.body, color: Colors.textSecondary, width: 32 },
});

// ─── Period selector ──────────────────────────────────────────────────────────
function PeriodSelector({ value, onChange }) {
  return (
    <View style={ps.row}>
      {PERIODS.map(p => (
        <TouchableOpacity
          key={p.key}
          style={[ps.btn, value === p.key && ps.btnActive]}
          onPress={() => onChange(p.key)}
          activeOpacity={0.8}
        >
          <Text style={[ps.label, value === p.key && ps.labelActive]}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const ps = StyleSheet.create({
  row:         { flexDirection: 'row', gap: Spacing.sm },
  btn:         { flex: 1, height: 36, borderRadius: Radius.full, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  btnActive:   { backgroundColor: Colors.primary },
  label:       { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '600' },
  labelActive: { color: Colors.background, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MetricsScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const thisWeek = getWeekMonday();

  // Form state
  const [weightStr, setWeightStr] = useState('');
  const [waistStr,  setWaistStr]  = useState('');
  const [dietStr,   setDietStr]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [hasEntry,  setHasEntry]  = useState(false);

  // Data from Supabase
  const [rawMetrics,   setRawMetrics]  = useState([]);  // body_metrics rows (52 weeks)
  const [sessionDates, setSessionDates] = useState([]); // started_at strings (all sessions)
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Period selector
  const [period, setPeriod] = useState('6M');

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;

      // Fetch up to 52 weeks of manual metrics + all session dates in parallel
      const [{ data: mData }, { data: sData }] = await Promise.all([
        supabase.from('body_metrics')
          .select('week_date, weight_kg, waist_cm, diet_pct')
          .eq('user_id', auth.user.id)
          .order('week_date', { ascending: true })
          .limit(52),
        supabase.from('workout_sessions')
          .select('started_at')
          .eq('user_id', auth.user.id)
          .order('started_at', { ascending: true }),
      ]);

      if (mData) setRawMetrics(mData);
      if (sData) setSessionDates(sData.map(s => s.started_at));

      // Pre-fill form if this week has an entry
      const entry = (mData ?? []).find(r => r.week_date === thisWeek);
      setHasEntry(!!entry);
      setWeightStr(entry?.weight_kg != null ? String(entry.weight_kg) : '');
      setWaistStr( entry?.waist_cm  != null ? String(entry.waist_cm)  : '');
      setDietStr(  entry?.diet_pct  != null ? String(entry.diet_pct)  : '');
    } catch (e) {
      console.warn('[Metrics] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [thisWeek]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const save = async () => {
    const weight = weightStr ? parseFloat(weightStr) : null;
    const waist  = waistStr  ? parseFloat(waistStr)  : null;
    const diet   = dietStr   ? parseInt(dietStr, 10) : null;

    if (weight == null && waist == null && diet == null) {
      Alert.alert('Nothing to save', 'Enter at least one metric before saving.'); return;
    }
    if (diet != null && (diet < 0 || diet > 100)) {
      Alert.alert('Invalid value', 'Diet adherence must be 0–100.'); return;
    }
    setSaving(true);
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;
      const { error } = await supabase.from('body_metrics').upsert({
        user_id:   auth.user.id,
        week_date: thisWeek,
        weight_kg: weight != null ? Math.round(weight * 10) / 10 : null,
        waist_cm:  waist  != null ? Math.round(waist  * 10) / 10 : null,
        diet_pct:  diet,
      }, { onConflict: 'user_id,week_date' });

      if (error) Alert.alert('Save failed', error.message);
      else { setHasEntry(true); load(); }
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Compute chart data for the selected period ─────────────────────────────
  const periodCfg = PERIODS.find(p => p.key === period);
  const allWeeks  = getLastNWeeks(periodCfg.weeks); // e.g. last 26 Mondays
  const periodStart = allWeeks[0];

  // Training count: count sessions per week within the period
  const trainingByWeek = {};
  sessionDates.forEach(isoTs => {
    const wk = getWeekMonday(new Date(isoTs));
    if (wk >= periodStart) trainingByWeek[wk] = (trainingByWeek[wk] ?? 0) + 1;
  });

  // Training count for THIS week (shown in form)
  const thisWeekTrainings = trainingByWeek[thisWeek] ?? 0;

  // Build chart arrays — filter rawMetrics to period, map to week slots
  const metricsInPeriod = rawMetrics.filter(r => r.week_date >= periodStart);

  const chartData = {
    training: allWeeks.map(wk => ({ week_date: wk, value: trainingByWeek[wk] ?? 0 })),
    weight:   metricsInPeriod.filter(r => r.weight_kg != null).map(r => ({ week_date: r.week_date, value: parseFloat(r.weight_kg) })),
    waist:    metricsInPeriod.filter(r => r.waist_cm  != null).map(r => ({ week_date: r.week_date, value: parseFloat(r.waist_cm)  })),
    diet:     metricsInPeriod.filter(r => r.diet_pct  != null).map(r => ({ week_date: r.week_date, value: r.diet_pct })),
  };

  const hasAnyHistory = chartData.weight.length >= 2 || chartData.waist.length >= 2 ||
                        chartData.diet.length >= 2   || sessionDates.length >= 2;

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Weekly Metrics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ── This week entry form ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>
            This week · {shortDate(thisWeek)}
            {hasEntry && <Text style={{ color: Colors.primary }}>  ✓ Logged</Text>}
          </Text>

          <View style={s.formCard}>
            {/* Training count — auto, not editable */}
            <View style={mi.row}>
              <Text style={mi.label}>Trainings</Text>
              <View style={[mi.wrap, { backgroundColor: 'transparent' }]}>
                <Text style={[mi.input, { color: thisWeekTrainings > 0 ? Colors.primary : Colors.textMuted, textAlign: 'center', paddingVertical: 10 }]}>
                  {thisWeekTrainings}
                </Text>
              </View>
              <Text style={mi.unit}>/ wk</Text>
            </View>
            <View style={s.divider} />
            <MetricInput label="Weight" value={weightStr} onChange={setWeightStr} unit="kg"  placeholder="82.5" decimal max={999} />
            <View style={s.divider} />
            <MetricInput label="Waist"  value={waistStr}  onChange={setWaistStr}  unit="cm"  placeholder="91.0" decimal max={999} />
            <View style={s.divider} />
            <MetricInput label="Diet"   value={dietStr}   onChange={setDietStr}   unit="%"   placeholder="80"   decimal={false} max={100} />

            {dietStr !== '' && (
              <View style={s.dietTrack}>
                <View style={[s.dietFill, {
                  width: `${Math.min(100, Math.max(0, parseInt(dietStr, 10) || 0))}%`,
                  backgroundColor: parseInt(dietStr,10) >= 80 ? Colors.primary : parseInt(dietStr,10) >= 50 ? Colors.amber : Colors.danger,
                }]} />
              </View>
            )}

            <TouchableOpacity style={s.saveBtn} onPress={save} activeOpacity={0.8} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.background} size="small" />
                : <><Ionicons name="checkmark" size={20} color={Colors.background} />
                    <Text style={s.saveTxt}>{hasEntry ? 'Update This Week' : 'Save This Week'}</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Charts ── */}
        {hasAnyHistory && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>History</Text>
            <PeriodSelector value={period} onChange={setPeriod} />

            <ChartCard
              title="Weekly trainings" icon="barbell-outline"
              color={Colors.primary}
              data={chartData.training.filter(d => d.value > 0 || true)} // keep all weeks to show zeroes
              unit=""
              latest={thisWeekTrainings}
              domain={[0, Math.max(...chartData.training.map(d => d.value), 1)]}
            />
            {chartData.weight.length >= 2 && (
              <ChartCard title="Weight" icon="body-outline" color={Colors.blue}
                data={chartData.weight} unit=" kg"
                latest={chartData.weight.at(-1)?.value.toFixed(1)} />
            )}
            {chartData.waist.length >= 2 && (
              <ChartCard title="Waist" icon="resize-outline" color={Colors.amber}
                data={chartData.waist} unit=" cm"
                latest={chartData.waist.at(-1)?.value.toFixed(1)} />
            )}
            {chartData.diet.length >= 2 && (
              <ChartCard title="Diet adherence" icon="restaurant-outline" color={Colors.gold}
                data={chartData.diet} unit="%" domain={[0, 100]}
                latest={chartData.diet.at(-1)?.value} />
            )}
          </View>
        )}

        {!hasAnyHistory && (
          <View style={s.empty}>
            <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTxt}>Charts appear after logging metrics{'\n'}or completing workouts across multiple weeks.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:      { width: 40 },
  title:        { ...Typography.h2, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content:      { padding: Spacing.md, gap: Spacing.lg },
  section:      { gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  formCard:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, ...Shadows.card },
  divider:      { height: 1, backgroundColor: Colors.border },
  dietTrack:    { height: 6, backgroundColor: Colors.surfaceRaised, borderRadius: 3, overflow: 'hidden' },
  dietFill:     { height: '100%', borderRadius: 3 },
  saveBtn:      { height: 52, borderRadius: Radius.full, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  saveTxt:      { ...Typography.h3, color: Colors.background, fontWeight: '700' },
  empty:        { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTxt:     { ...Typography.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
