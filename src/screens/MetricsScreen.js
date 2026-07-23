/**
 * MetricsScreen — weekly body metrics logging and history charts.
 *
 * Metrics tracked:
 *   • Weight (kg, 1 decimal place)
 *   • Waist circumference (cm, 1 decimal place)
 *   • Diet adherence (%, integer 0–100)
 *
 * week_date is always the ISO Monday of the current week, so one entry
 * per week per user — saved via upsert.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { supabase } from '../config/supabase';

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** Returns the ISO Monday (YYYY-MM-DD) for any given date (default: today). */
function getWeekMonday(d = new Date()) {
  const date = new Date(d);
  const day  = date.getDay(); // 0 = Sunday
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

/** Short label for a YYYY-MM-DD date. */
function shortDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// ─── Line chart (pure View, onLayout-based) ───────────────────────────────────
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

  const every = data.length > 8 ? Math.ceil(data.length / 6) : 1;

  return (
    <View>
      <View style={{ height: HEIGHT }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && pts.slice(0, -1).map((p, i) => {
          const n  = pts[i + 1];
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
        {w > 0 && (
          <>
            <Text style={[lc.axisLabel, { top: PAD - 8 }]}>{max}</Text>
            <Text style={[lc.axisLabel, { bottom: 4 }]}>{min}</Text>
          </>
        )}
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

// ─── Single metric card with chart ───────────────────────────────────────────
function MetricCard({ title, icon, color, data, unit, domain }) {
  if (!data?.length) return null;
  const latest = data[data.length - 1];
  return (
    <View style={mc.card}>
      <View style={mc.header}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={mc.title}>{title}</Text>
        <Text style={[mc.latest, { color }]}>
          {latest.value}{unit}
        </Text>
      </View>
      <MetricLineChart data={data} color={color} domain={domain} />
    </View>
  );
}
const mc = StyleSheet.create({
  card:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, ...Shadows.card },
  header:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title:   { ...Typography.label, color: Colors.textSecondary, flex: 1, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  latest:  { ...Typography.h3, fontWeight: '700' },
});

// ─── Number input row ─────────────────────────────────────────────────────────
function MetricInput({ label, value, onChange, unit, placeholder, decimal, max }) {
  return (
    <View style={mi.row}>
      <Text style={mi.label}>{label}</Text>
      <View style={mi.inputWrap}>
        <TextInput
          style={mi.input}
          value={value}
          onChangeText={t => {
            // Allow digits, one decimal point (if decimal mode)
            let clean = decimal ? t.replace(/[^0-9.]/g, '') : t.replace(/[^0-9]/g, '');
            // Prevent multiple decimal points
            const parts = clean.split('.');
            if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
            // Limit decimal places
            if (decimal && parts[1]?.length > 1) clean = parts[0] + '.' + parts[1].slice(0, 1);
            // Clamp max
            if (max != null && parseFloat(clean) > max) clean = String(max);
            onChange(clean);
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
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label:    { ...Typography.body, color: Colors.textPrimary, width: 58 },
  inputWrap:{ flex: 1, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md },
  input:    { height: 44, paddingHorizontal: Spacing.md, ...Typography.h3, color: Colors.textPrimary, textAlign: 'center' },
  unit:     { ...Typography.body, color: Colors.textSecondary, width: 32 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MetricsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const thisWeek = getWeekMonday();

  // Form state (strings for controlled inputs)
  const [weightStr, setWeightStr] = useState('');
  const [waistStr,  setWaistStr]  = useState('');
  const [dietStr,   setDietStr]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [hasEntry,  setHasEntry]  = useState(false);

  // Chart data — last 16 weeks
  const [metrics,    setMetrics]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;

      // Fetch last 16 weeks of metrics (most-recent-first then reverse for chart)
      const { data, error } = await supabase
        .from('body_metrics')
        .select('week_date, weight_kg, waist_cm, diet_pct')
        .eq('user_id', auth.user.id)
        .order('week_date', { ascending: false })
        .limit(16);

      if (error) { console.warn('[Metrics] fetch error:', error.message); return; }

      const sorted = (data ?? []).slice().reverse(); // oldest → newest
      setMetrics(sorted);

      // Pre-fill form if this week already has an entry
      const thisEntry = (data ?? []).find(r => r.week_date === thisWeek);
      if (thisEntry) {
        setHasEntry(true);
        setWeightStr(thisEntry.weight_kg != null ? String(thisEntry.weight_kg) : '');
        setWaistStr( thisEntry.waist_cm  != null ? String(thisEntry.waist_cm)  : '');
        setDietStr(  thisEntry.diet_pct  != null ? String(thisEntry.diet_pct)  : '');
      } else {
        setHasEntry(false);
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
      Alert.alert('Nothing to save', 'Enter at least one metric before saving.');
      return;
    }
    if (diet != null && (diet < 0 || diet > 100)) {
      Alert.alert('Invalid value', 'Diet adherence must be between 0 and 100.');
      return;
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

      if (error) {
        Alert.alert('Save failed', error.message);
      } else {
        setHasEntry(true);
        load(); // refresh charts
      }
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // Build chart data arrays
  const weightData = metrics.filter(r => r.weight_kg != null).map(r => ({ week_date: r.week_date, value: parseFloat(r.weight_kg) }));
  const waistData  = metrics.filter(r => r.waist_cm  != null).map(r => ({ week_date: r.week_date, value: parseFloat(r.waist_cm)  }));
  const dietData   = metrics.filter(r => r.diet_pct  != null).map(r => ({ week_date: r.week_date, value: r.diet_pct }));

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
            {hasEntry ? '  ✓ Logged' : ''}
          </Text>

          <View style={s.formCard}>
            <MetricInput label="Weight" value={weightStr} onChange={setWeightStr} unit="kg" placeholder="82.5" decimal max={999} />
            <View style={s.divider} />
            <MetricInput label="Waist"  value={waistStr}  onChange={setWaistStr}  unit="cm" placeholder="91.0" decimal max={999} />
            <View style={s.divider} />
            <MetricInput label="Diet"   value={dietStr}   onChange={setDietStr}   unit="%" placeholder="80"    decimal={false} max={100} />

            {/* Diet visual bar */}
            {dietStr && parseInt(dietStr, 10) >= 0 && (
              <View style={s.dietBarTrack}>
                <View style={[s.dietBarFill, {
                  width: `${Math.min(100, parseInt(dietStr, 10) || 0)}%`,
                  backgroundColor: parseInt(dietStr, 10) >= 80 ? Colors.primary : parseInt(dietStr, 10) >= 50 ? Colors.amber : Colors.danger,
                }]} />
              </View>
            )}

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

        {/* ── Charts ── */}
        {weightData.length >= 2 || waistData.length >= 2 || dietData.length >= 2 ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>History</Text>

            {weightData.length >= 2 && (
              <MetricCard
                title="Weight" icon="barbell-outline"
                color={Colors.primary} data={weightData} unit=" kg" />
            )}
            {waistData.length >= 2 && (
              <MetricCard
                title="Waist circumference" icon="resize-outline"
                color={Colors.blue} data={waistData} unit=" cm" />
            )}
            {dietData.length >= 2 && (
              <MetricCard
                title="Diet adherence" icon="restaurant-outline"
                color={Colors.gold} data={dietData} unit="%" domain={[0, 100]} />
            )}
          </View>
        ) : (
          metrics.length <= 1 && (
            <View style={s.emptyHint}>
              <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
              <Text style={s.emptyTxt}>Charts appear after 2+ weeks of data</Text>
            </View>
          )
        )}
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

  dietBarTrack: { height: 6, backgroundColor: Colors.surfaceRaised, borderRadius: 3, overflow: 'hidden' },
  dietBarFill:  { height: '100%', borderRadius: 3 },

  saveBtn:   { height: 52, borderRadius: Radius.full, backgroundColor: Colors.primary,
               flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  saveTxt:   { ...Typography.h3, color: Colors.background, fontWeight: '700' },

  emptyHint: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTxt:  { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
});
