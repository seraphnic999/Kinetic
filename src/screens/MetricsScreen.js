import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Colors, Typography, Spacing, Radius, Shadows, IconSize } from '../theme';
import { Icon } from '../components/Icon';
import { supabase } from '../config/supabase';
import { PickerModal, PickerField } from '../components/PickerModal';

// ─── Date helpers ─────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().slice(0, 10);
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
const longDate  = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });

const PERIODS = [
  { key: '1M',  label: '1 Month',   days: 30  },
  { key: '6M',  label: '6 Months',  days: 182 },
  { key: '12M', label: '12 Months', days: 364 },
];

// ─── Metric type definitions ─────────────────────────────────────────────────
const METRICS = {
  weight: { key: 'weight', label: 'Weight', field: 'weight_kg', unit: 'kg',  color: Colors.blue,  icon: 'bodyProfile',       decimal: true,  max: 999 },
  waist:  { key: 'waist',  label: 'Waist',  field: 'waist_cm',  unit: 'cm',  color: Colors.amber, icon: 'tape',     decimal: true,  max: 999 },
  diet:   { key: 'diet',   label: 'Diet',   field: 'diet_pct',  unit: '%',   color: Colors.gold,  icon: 'diet', decimal: false, max: 100 },
};
const METRIC_OPTIONS = Object.values(METRICS).map(m => ({ key: m.key, label: m.label }));

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
              {i % every === 0 && <Text style={lc.xLabel}>{shortDate(d.date)}</Text>}
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
        <Icon name={icon} size={IconSize.meta} color={color} />
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
  const insets = useSafeAreaInsets();

  // Form state
  const [metricKey, setMetricKey]   = useState('weight');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [valueStr, setValueStr]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [showMetricPicker, setShowMetricPicker] = useState(false);

  // Data from Supabase
  const [rawMetrics, setRawMetrics] = useState([]); // body_metrics rows
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Period selector
  const [period, setPeriod] = useState('6M');

  const metric = METRICS[metricKey];

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;

      const { data: mData } = await supabase.from('body_metrics')
        .select('week_date, weight_kg, waist_cm, diet_pct')
        .eq('user_id', auth.user.id)
        .order('week_date', { ascending: true })
        .limit(400);

      if (mData) setRawMetrics(mData);
    } catch (e) {
      console.warn('[Metrics] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  // Pre-fill the value field whenever the metric type or date changes
  useEffect(() => {
    const entry = rawMetrics.find(r => r.week_date === selectedDate);
    const v = entry?.[metric.field];
    setValueStr(v != null ? String(v) : '');
  }, [rawMetrics, selectedDate, metric.field]);

  const hasEntryForDate = rawMetrics.some(r => r.week_date === selectedDate && r[metric.field] != null);

  const save = async () => {
    const value = valueStr ? parseFloat(valueStr) : null;
    if (value == null) {
      Alert.alert('Nothing to save', 'Enter a value before saving.'); return;
    }
    if (metric.key === 'diet' && (value < 0 || value > 100)) {
      Alert.alert('Invalid value', 'Diet adherence must be 0–100.'); return;
    }
    setSaving(true);
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;
      const rounded = metric.decimal ? Math.round(value * 10) / 10 : Math.round(value);
      const { error } = await supabase.from('body_metrics').upsert({
        user_id:      auth.user.id,
        week_date:    selectedDate,
        [metric.field]: rounded,
      }, { onConflict: 'user_id,week_date' });

      if (error) Alert.alert('Save failed', error.message);
      else load();
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    DateTimePickerAndroid.open({
      value: new Date(selectedDate + 'T12:00:00'),
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (event, date) => {
        if (date) setSelectedDate(date.toISOString().slice(0, 10));
      },
    });
  };

  // ── Compute chart data for the selected period ─────────────────────────────
  const periodCfg = PERIODS.find(p => p.key === period);
  const periodStartDate = new Date();
  periodStartDate.setDate(periodStartDate.getDate() - periodCfg.days);
  const periodStart = periodStartDate.toISOString().slice(0, 10);

  const metricsInPeriod = rawMetrics.filter(r => r.week_date >= periodStart);

  const chartData = {
    weight: metricsInPeriod.filter(r => r.weight_kg != null).map(r => ({ date: r.week_date, value: parseFloat(r.weight_kg) })),
    waist:  metricsInPeriod.filter(r => r.waist_cm  != null).map(r => ({ date: r.week_date, value: parseFloat(r.waist_cm)  })),
    diet:   metricsInPeriod.filter(r => r.diet_pct  != null).map(r => ({ date: r.week_date, value: r.diet_pct })),
  };

  const hasAnyHistory = chartData.weight.length >= 2 || chartData.waist.length >= 2 || chartData.diet.length >= 2;

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
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={s.title}>Body</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ── Add entry form ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>
            Log a metric
            {hasEntryForDate && <Text style={{ color: Colors.primary }}>  ✓ Logged</Text>}
          </Text>

          <View style={s.formCard}>
            <PickerField
              label="Metric"
              value={metric.label}
              placeholder="Select metric..."
              onPress={() => setShowMetricPicker(true)}
            />

            <TouchableOpacity style={s.dateField} onPress={openDatePicker} activeOpacity={0.7}>
              <Icon name="calendar" size={IconSize.meta} color={Colors.textSecondary} />
              <Text style={s.dateFieldTxt}>{longDate(selectedDate)}</Text>
              <Text style={s.dateFieldChange}>Change</Text>
            </TouchableOpacity>

            <View style={mi.row}>
              <Text style={mi.label}>{metric.label}</Text>
              <View style={mi.wrap}>
                <TextInput
                  style={mi.input}
                  value={valueStr}
                  onChangeText={t => {
                    let val = metric.decimal ? t.replace(/[^0-9.]/g, '') : t.replace(/[^0-9]/g, '');
                    const parts = val.split('.');
                    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                    if (metric.decimal && parts[1]?.length > 1) val = parts[0] + '.' + parts[1].slice(0, 1);
                    if (parseFloat(val) > metric.max) val = String(metric.max);
                    setValueStr(val);
                  }}
                  keyboardType={metric.decimal ? 'decimal-pad' : 'number-pad'}
                  placeholder={metric.key === 'weight' ? '82.5' : metric.key === 'waist' ? '91.0' : '80'}
                  placeholderTextColor={Colors.textMuted}
                  selectTextOnFocus
                />
              </View>
              <Text style={mi.unit}>{metric.unit}</Text>
            </View>

            {metric.key === 'diet' && valueStr !== '' && (
              <View style={s.dietTrack}>
                <View style={[s.dietFill, {
                  width: `${Math.min(100, Math.max(0, parseInt(valueStr, 10) || 0))}%`,
                  backgroundColor: parseInt(valueStr, 10) >= 80 ? Colors.primary : parseInt(valueStr, 10) >= 50 ? Colors.amber : Colors.danger,
                }]} />
              </View>
            )}

            <TouchableOpacity style={s.saveBtn} onPress={save} activeOpacity={0.8} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.background} size="small" />
                : <><Icon name="check" size={IconSize.meta} color={Colors.background} />
                    <Text style={s.saveTxt}>{hasEntryForDate ? 'Update Entry' : 'Save Entry'}</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Charts ── */}
        {hasAnyHistory && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>History</Text>
            <PeriodSelector value={period} onChange={setPeriod} />

            {chartData.weight.length >= 2 && (
              <ChartCard title="Weight" icon="bodyProfile" color={Colors.blue}
                data={chartData.weight} unit=" kg"
                latest={chartData.weight.at(-1)?.value.toFixed(1)} />
            )}
            {chartData.waist.length >= 2 && (
              <ChartCard title="Waist" icon="tape" color={Colors.amber}
                data={chartData.waist} unit=" cm"
                latest={chartData.waist.at(-1)?.value.toFixed(1)} />
            )}
            {chartData.diet.length >= 2 && (
              <ChartCard title="Diet adherence" icon="diet" color={Colors.gold}
                data={chartData.diet} unit="%" domain={[0, 100]}
                latest={chartData.diet.at(-1)?.value} />
            )}
          </View>
        )}

        {!hasAnyHistory && (
          <View style={s.empty}>
            <Icon name="chartBar" size={IconSize.section} color={Colors.textMuted} />
            <Text style={s.emptyTxt}>Charts appear after logging the same metric{'\n'}on at least two different days.</Text>
          </View>
        )}
      </ScrollView>

      <PickerModal
        visible={showMetricPicker}
        title="Select Metric"
        options={METRIC_OPTIONS}
        selected={metricKey}
        onSelect={setMetricKey}
        onClose={() => setShowMetricPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title:        { ...Typography.h1, color: Colors.text },
  content:      { padding: Spacing.md, gap: Spacing.lg },
  section:      { gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  formCard:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, ...Shadows.card },
  dateField:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, height: 48, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised, paddingHorizontal: Spacing.md },
  dateFieldTxt: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  dateFieldChange: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },
  dietTrack:    { height: 6, backgroundColor: Colors.surfaceRaised, borderRadius: 3, overflow: 'hidden' },
  dietFill:     { height: '100%', borderRadius: 3 },
  saveBtn:      { height: 52, borderRadius: Radius.full, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  saveTxt:      { ...Typography.h3, color: Colors.background, fontWeight: '700' },
  empty:        { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTxt:     { ...Typography.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});

const mi = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { ...Typography.body, color: Colors.textPrimary, width: 62 },
  wrap:  { flex: 1, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md },
  input: { height: 44, paddingHorizontal: Spacing.md, ...Typography.h3, color: Colors.textPrimary, textAlign: 'center' },
  unit:  { ...Typography.body, color: Colors.textSecondary, width: 32 },
});
