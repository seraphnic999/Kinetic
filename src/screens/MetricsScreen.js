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

// ─── Period options ───────────────────────────────────────────────────────────
const PERIODS = [
  { label: '1 Month',   weeks: 5  },
  { label: '6 Months',  weeks: 26 },
  { label: '12 Months', weeks: 52 },
];

// ─── Week / date helpers ──────────────────────────────────────────────────────
function getWeekMonday(d = new Date()) {
  const date = new Date(d);
  const day  = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function addWeeks(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// Build an array of week-start dates from (numWeeks) weeks ago up to this week
function buildWeekKeys(numWeeks) {
  const thisMonday = getWeekMonday();
  return Array.from({ length: numWeeks }, (_, i) => addWeeks(thisMonday, -(numWeeks - 1 - i)));
}

// ─── Line chart (pure View, onLayout-based, handles gaps) ────────────────────
function MetricLineChart({ data, color, domain, unit }) {
  const [w, setW] = useState(0);
  const filled = data.filter(d => d.value != null);
  if (filled.length < 2) return (
    <Text style={{ ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg }}>
      Not enough data for this period
    </Text>
  );

  const HEIGHT = 120;
  const DOT    = 7;
  const PAD    = DOT;

  const values = filled.map(d => d.value);
  const min    = domain?.[0] ?? Math.min(...values);
  const max    = domain?.[1] ?? Math.max(...values);
  const range  = Math.max(max - min, 0.01);

  // Only place points for entries that have a value
  const pts = w > 0 ? filled.map((d, i) => {
    const idx = data.findIndex(r => r.week === d.week);
    return {
      x: PAD + (idx / Math.max(data.length - 1, 1)) * (w - 2 * PAD),
      y: PAD + ((max - d.value) / range) * (HEIGHT - 2 * PAD),
      ...d,
    };
  }) : [];

  // Decide which x-labels to show (max ~6 labels)
  const every = Math.ceil(data.length / 6);

  return (
    <View>
      <View style={{ height: HEIGHT }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && pts.slice(0, -1).map((p, i) => {
          const n   = pts[i + 1];
          const dx  = n.x - p.x, dy = n.y - p.y;
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
          <Text style={[lc.axis, { top: PAD - 8 }]}>{max}{unit}</Text>
          <Text style={[lc.axis, { bottom: 4 }]}>{min}{unit}</Text>
        </>}
      </View>
      {w > 0 && (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {data.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {i % every === 0 && <Text style={lc.xLabel}>{shortDate(d.week)}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
const lc = StyleSheet.create({
  axis:   { position: 'absolute', right: 0, fontSize: 8, color: Colors.textMuted },
  xLabel: { fontSize: 8, color: Colors.textMuted },
});

// ─── Chart card ───────────────────────────────────────────────────────────────
function ChartCard({ title, icon, color, data, unit, domain, latest }) {
  const hasData = (data ?? []).filter(d => d.value != null).length >= 2;
  return (
    <View style={cc.card}>
      <View style={cc.header}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={cc.title}>{title}</Text>
        {latest != null && <Text style={[cc.latest, { color }]}>{latest}{unit}</Text>}
      </View>
      <MetricLineChart data={data ?? []} color={color} domain={domain} unit={unit} />
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
            let c = decimal ? t.replace(/[^0-9.]/g, '') : t.replace(/[^0-9]/g, '');
            const parts = c.split('.');
            if (parts.length > 2) c = parts[0] + '.' + parts.slice(1).join('');
            if (decimal && parts[1]?.length > 1) c = parts[0] + '.' + parts[1].slice(0, 1);
            if (max != null && parseFloat(c) > max) c = String(max);
            onChange(c);
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
  label: { ...Typography.body, color: Colors.textPrimary, width: 58 },
  wrap:  { flex: 1, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md },
  input: { height: 44, paddingHorizontal: Spacing.md, ...Typography.h3, color: Colors.textPrimary, textAlign: 'center' },
  unit:  { ...Typography.body, color: Colors.textSecondary, width: 32 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MetricsScreen({ navigation }) {
  const insets   = useSafeAreaInsets();
  const thisWeek = getWeekMonday();

  const [periodIdx, setPeriodIdx] = useState(0);       // 0=1M, 1=6M, 2=12M
  const { weeks: numWeeks }       = PERIODS[periodIdx];

  // Form state
  const [weightStr, setWeightStr] = useState('');
  const [waistStr,  setWaistStr]  = useState('');
  const [dietStr,   setDietStr]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [hasEntry,  setHasEntry]  = useState(false);

  // Raw data
  const [bodyData,     setBodyData]     = useState([]);  // body_metrics rows
  const [sessionDates, setSessionDates] = useState([]);  // started_at strings
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;

      // Fetch body_metrics (up to 52 weeks — enough for all period options)
      const metricsPromise = supabase
        .from('body_metrics')
        .select('week_date, weight_kg, waist_cm, diet_pct')
        .eq('user_id', auth.user.id)
        .order('week_date', { ascending: false })
        .limit(52);

      // Fetch session start dates for the last 52 weeks
      const cutoff = addWeeks(thisWeek, -52);
      const sessionsPromise = supabase
        .from('workout_sessions')
        .select('started_at')
        .eq('user_id', auth.user.id)
        .gte('started_at', cutoff);

      const [{ data: mData }, { data: sData }] = await Promise.all([metricsPromise, sessionsPromise]);

      setBodyData((mData ?? []).slice().reverse());   // oldest first
      setSessionDates((sData ?? []).map(s => s.started_at));

      // Pre-fill form with this week's existing entry
      const thisEntry = (mData ?? []).find(r => r.week_date === thisWeek);
      if (thisEntry) {
        setHasEntry(true);
        setWeightStr(thisEntry.weight_kg != null ? String(thisEntry.weight_kg) : '');
        setWaistStr( thisEntry.waist_cm  != null ? String(thisEntry.waist_cm)  : '');
        setDietStr(  thisEntry.diet_pct  != null ? String(thisEntry.diet_pct)  : '');
      } else {
        setHasEntry(false);
        // Don't reset strings if user is mid-entry
      }
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
    } catch (e) { Alert.alert('Save failed', e?.message ?? String(e)); }
    finally { setSaving(false); }
  };

  // ── Build chart-ready data for selected period ──────────────────────────────
  const weekKeys   = buildWeekKeys(numWeeks);
  const metricsMap = Object.fromEntries(bodyData.map(r => [r.week_date, r]));

  // Count sessions per week
  const sessionCountByWeek = {};
  sessionDates.forEach(iso => {
    const mon = getWeekMonday(new Date(iso));
    sessionCountByWeek[mon] = (sessionCountByWeek[mon] ?? 0) + 1;
  });

  // Unified rows for each chart (null = no entry that week)
  const trainingData = weekKeys.map(w => ({ week: w, value: sessionCountByWeek[w] ?? 0 }));
  const weightData   = weekKeys.map(w => ({ week: w, value: metricsMap[w]?.weight_kg ?? null }));
  const waistData    = weekKeys.map(w => ({ week: w, value: metricsMap[w]?.waist_cm  ?? null }));
  const dietData     = weekKeys.map(w => ({ week: w, value: metricsMap[w]?.diet_pct  ?? null }));

  // Latest values (for the card header)
  const latestWeight = [...weightData].reverse().find(d => d.value != null)?.value;
  const latestWaist  = [...waistData ].reverse().find(d => d.value != null)?.value;
  const latestDiet   = [...dietData  ].reverse().find(d => d.value != null)?.value;
  const latestTraining = sessionCountByWeek[thisWeek] ?? 0;

  const dietColor = (latestDiet ?? 0) >= 80 ? Colors.primary
                  : (latestDiet ?? 0) >= 50 ? Colors.amber
                  : Colors.danger;

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
      {/* Header */}
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
        {/* ── Entry form ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>
            This week · {shortDate(thisWeek)}
            {hasEntry ? '  ✓ Saved' : ''}
          </Text>

          <View style={s.formCard}>
            <MetricInput label="Weight" value={weightStr} onChange={setWeightStr} unit="kg" placeholder="82.5" decimal max={999} />
            <View style={s.divider} />
            <MetricInput label="Waist"  value={waistStr}  onChange={setWaistStr}  unit="cm" placeholder="91.0" decimal max={999} />
            <View style={s.divider} />
            <MetricInput label="Diet"   value={dietStr}   onChange={setDietStr}   unit="%" placeholder="80" decimal={false} max={100} />

            {/* Diet colour bar */}
            {!!dietStr && !isNaN(parseInt(dietStr, 10)) && (
              <View style={s.dietTrack}>
                <View style={[s.dietFill, {
                  width: `${Math.min(100, parseInt(dietStr, 10) || 0)}%`,
                  backgroundColor: parseInt(dietStr, 10) >= 80 ? Colors.primary
                    : parseInt(dietStr, 10) >= 50 ? Colors.amber : Colors.danger,
                }]} />
              </View>
            )}

            {/* Read-only: training count this week */}
            <View style={s.divider} />
            <View style={mi.row}>
              <Text style={mi.label}>Training</Text>
              <View style={[mi.wrap, { justifyContent: 'center' }]}>
                <Text style={[mi.input, { lineHeight: 44 }]}>{latestTraining}</Text>
              </View>
              <Text style={mi.unit}>× wk</Text>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={save} activeOpacity={0.8} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.background} size="small" />
                : <>
                    <Ionicons name="checkmark" size={20} color={Colors.background} />
                    <Text style={s.saveTxt}>{hasEntry ? 'Update This Week' : 'Save This Week'}</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Period selector + charts ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>History</Text>

          <View style={s.periodRow}>
            {PERIODS.map((p, i) => (
              <TouchableOpacity
                key={p.label}
                style={[s.periodBtn, periodIdx === i && s.periodBtnActive]}
                onPress={() => setPeriodIdx(i)}
                activeOpacity={0.8}
              >
                <Text style={[s.periodTxt, periodIdx === i && s.periodTxtActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ChartCard
            title="Weekly Trainings"
            icon="barbell-outline"
            color={Colors.primary}
            data={trainingData}
            unit=" sessions"
            domain={[0, Math.max(...trainingData.map(d => d.value), 1)]}
            latest={latestTraining}
          />

          {weightData.some(d => d.value != null) && (
            <ChartCard
              title="Weight"
              icon="scale-outline"
              color={Colors.blue}
              data={weightData}
              unit=" kg"
              latest={latestWeight}
            />
          )}

          {waistData.some(d => d.value != null) && (
            <ChartCard
              title="Waist Circumference"
              icon="resize-outline"
              color={Colors.amber}
              data={waistData}
              unit=" cm"
              latest={latestWaist}
            />
          )}

          {dietData.some(d => d.value != null) && (
            <ChartCard
              title="Diet Adherence"
              icon="restaurant-outline"
              color={dietColor}
              data={dietData}
              unit="%"
              domain={[0, 100]}
              latest={latestDiet}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { width: 40 },
  title:     { ...Typography.h2, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content:   { padding: Spacing.md, gap: Spacing.lg },
  section:   { gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },

  formCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, ...Shadows.card },
  divider:   { height: 1, backgroundColor: Colors.border },
  dietTrack: { height: 6, backgroundColor: Colors.surfaceRaised, borderRadius: 3, overflow: 'hidden' },
  dietFill:  { height: '100%', borderRadius: 3 },

  saveBtn:   { height: 52, borderRadius: Radius.full, backgroundColor: Colors.primary,
               flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  saveTxt:   { ...Typography.h3, color: Colors.background, fontWeight: '700' },

  periodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  periodBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.full,
               backgroundColor: Colors.surfaceRaised, alignItems: 'center' },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodTxt:       { ...Typography.label, color: Colors.textSecondary },
  periodTxtActive: { color: Colors.background, fontWeight: '700' },
});
