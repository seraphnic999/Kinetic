import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { supabase } from '../config/supabase';

// ─── Date helpers ──────────────────────────────────────────────────────────────
function getWeekMonday(date = new Date()) {
  const d = new Date(date); d.setHours(12, 0, 0, 0);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function weekLabel(iso) {
  const mon = new Date(iso + 'T12:00:00Z');
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = d => d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return `${f(mon)} – ${f(sun)}`;
}
function shiftWeek(iso, delta) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setDate(d.getDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}
function isCurrentOrPast(iso) {
  return iso <= getWeekMonday();
}

// ─── Pure-View charts (same approach as DashboardScreen) ──────────────────────
function LineChart({ data, color, unit = '' }) {
  const [w, setW] = useState(0);
  const valid = data.filter(d => d.value != null);
  if (!valid.length) return (
    <Text style={{ color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg, fontSize: 13 }}>
      No data yet
    </Text>
  );
  const HEIGHT = 100;
  const DOT    = 7;
  const PAD    = DOT / 2 + 4;
  const max    = Math.max(...valid.map(d => d.value));
  const min    = Math.min(...valid.map(d => d.value));
  const range  = max - min || 1;
  const pts    = w > 0 ? data.map((d, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (w - 2 * PAD),
    y: d.value == null ? null : PAD + ((max - d.value) / range) * (HEIGHT - 2 * PAD),
    ...d,
  })) : [];
  const every = data.length > 8 ? Math.ceil(data.length / 6) : 1;

  return (
    <View>
      <View style={{ height: HEIGHT }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && pts.slice(0, -1).map((p, i) => {
          const n = pts[i + 1];
          if (p.y == null || n.y == null) return null;
          const dx = n.x - p.x, dy = n.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <View key={i} style={{
              position: 'absolute',
              left: (p.x + n.x) / 2 - len / 2, top: (p.y + n.y) / 2 - 1.5,
              width: len, height: 3, backgroundColor: color + '70',
              transform: [{ rotate: `${ang}deg` }],
            }} />
          );
        })}
        {w > 0 && pts.map((p, i) => p.y == null ? null : (
          <View key={i} style={{
            position: 'absolute', left: p.x - DOT / 2, top: p.y - DOT / 2,
            width: DOT, height: DOT, borderRadius: DOT / 2,
            backgroundColor: color, borderWidth: 2, borderColor: Colors.background,
          }} />
        ))}
        {w > 0 && valid.length > 0 && (
          <>
            <Text style={{ position: 'absolute', right: 0, top: PAD - 8, fontSize: 8, color: Colors.textMuted }}>
              {max}{unit}
            </Text>
            <Text style={{ position: 'absolute', right: 0, bottom: 4, fontSize: 8, color: Colors.textMuted }}>
              {min}{unit}
            </Text>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {i % every === 0 && (
              <Text style={{ fontSize: 8, color: Colors.textMuted }}>{d.label}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DietBar({ data }) {
  if (!data.some(d => d.value != null)) return (
    <Text style={{ color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg, fontSize: 13 }}>
      No data yet
    </Text>
  );
  const max = 100;
  const HEIGHT = 100;
  const every = data.length > 8 ? Math.ceil(data.length / 6) : 1;
  const barColor = v => v >= 90 ? '#4CAF50' : v >= 70 ? Colors.amber : Colors.danger;

  return (
    <View>
      <View style={{ height: HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {data.map((d, i) => {
          const barH = d.value == null ? 0 : Math.max(4, (d.value / max) * (HEIGHT - 16));
          const col  = d.value == null ? Colors.raised : barColor(d.value);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              {d.value != null && (
                <Text style={{ fontSize: 8, color: col, marginBottom: 2 }}>{d.value}%</Text>
              )}
              <View style={{ width: '70%', height: barH, backgroundColor: col + (d.value == null ? '0' : 'CC'), borderRadius: 3 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {i % every === 0 && <Text style={{ fontSize: 8, color: Colors.textMuted }}>{d.label}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Metric input ──────────────────────────────────────────────────────────────
function MetricInput({ label, value, onChange, unit, placeholder, decimal }) {
  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.metricInputWrap}>
        <TextInput
          style={s.metricInput}
          value={value}
          onChangeText={onChange}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          selectTextOnFocus
        />
        <Text style={s.metricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

// ─── Chart card ───────────────────────────────────────────────────────────────
function ChartCard({ title, icon, color, children }) {
  return (
    <View style={s.chartCard}>
      <View style={s.chartHeader}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={[s.chartTitle, { color }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── Build chart data (last 16 weeks) ─────────────────────────────────────────
function buildChartData(metrics) {
  const map = {};
  metrics.forEach(m => { map[m.week_date] = m; });
  const weeks = [];
  for (let i = 15; i >= 0; i--) {
    const mon = shiftWeek(getWeekMonday(), -i);
    const m   = map[mon];
    const d   = new Date(mon + 'T12:00:00Z');
    const lbl = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    weeks.push({
      label:    lbl,
      weight:   m?.weight_kg ?? null,
      waist:    m?.waist_cm  ?? null,
      diet:     m?.diet_pct  ?? null,
    });
  }
  return weeks;
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function MetricsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [metrics, setMetrics]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving]         = useState(false);

  // Week navigation for the log form
  const [formWeek, setFormWeek]     = useState(getWeekMonday());

  // Form values (strings for text inputs)
  const [weight, setWeight] = useState('');
  const [waist,  setWaist]  = useState('');
  const [diet,   setDiet]   = useState('');

  const populateForm = useCallback((week, data) => {
    const entry = data.find(m => m.week_date === week);
    setWeight(entry?.weight_kg != null ? String(entry.weight_kg) : '');
    setWaist( entry?.waist_cm  != null ? String(entry.waist_cm)  : '');
    setDiet(  entry?.diet_pct  != null ? String(entry.diet_pct)  : '');
  }, []);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('weekly_metrics')
      .select('week_date, weight_kg, waist_cm, diet_pct')
      .order('week_date', { ascending: false })
      .limit(52);
    if (data) {
      setMetrics(data);
      populateForm(formWeek, data);
    }
    setLoading(false);
    setRefreshing(false);
  }, [formWeek, populateForm]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const changeWeek = (delta) => {
    const next = shiftWeek(formWeek, delta);
    if (delta > 0 && next > getWeekMonday()) return; // can't go into future
    setFormWeek(next);
    populateForm(next, metrics);
  };

  const save = async () => {
    const w = parseFloat(weight);
    const c = parseFloat(waist);
    const d = parseInt(diet, 10);
    if (isNaN(w) && isNaN(c) && isNaN(d)) return;

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const payload = {
      user_id:  session.user.id,
      week_date: formWeek,
      ...(!isNaN(w) && { weight_kg: w }),
      ...(!isNaN(c) && { waist_cm: c }),
      ...(!isNaN(d) && d >= 0 && d <= 100 && { diet_pct: d }),
    };

    await supabase.from('weekly_metrics').upsert(payload, { onConflict: 'user_id,week_date' });
    await load();
    setSaving(false);
  };

  const chartData = buildChartData(metrics);
  const weightData = chartData.map(d => ({ label: d.label, value: d.weight }));
  const waistData  = chartData.map(d => ({ label: d.label, value: d.waist }));
  const dietData   = chartData.map(d => ({ label: d.label, value: d.diet }));

  const isFuture = formWeek > getWeekMonday();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Body Metrics</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Log form ── */}
          <View style={s.logCard}>
            <Text style={s.sectionTitle}>LOG WEEK</Text>

            {/* Week selector */}
            <View style={s.weekRow}>
              <TouchableOpacity onPress={() => changeWeek(-1)} style={s.weekArrow}>
                <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={s.weekLabel}>{weekLabel(formWeek)}</Text>
              <TouchableOpacity
                onPress={() => changeWeek(1)}
                style={[s.weekArrow, isFuture && { opacity: 0.3 }]}
                disabled={isFuture}
              >
                <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <MetricInput label="Avg. Weight" value={weight} onChange={setWeight}
              unit="kg" placeholder="82.5" decimal />
            <MetricInput label="Waist"  value={waist}  onChange={setWaist}
              unit="cm" placeholder="91" />
            <MetricInput label="Diet Adherence" value={diet} onChange={setDiet}
              unit="%" placeholder="85" />

            <TouchableOpacity style={s.saveBtn} onPress={save} activeOpacity={0.8} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.background} size="small" />
                : <>
                    <Ionicons name="checkmark" size={20} color={Colors.background} />
                    <Text style={s.saveBtnTxt}>Save Week</Text>
                  </>
              }
            </TouchableOpacity>
          </View>

          {/* ── Charts ── */}
          <Text style={[s.sectionTitle, { marginTop: Spacing.sm }]}>HISTORY (16 WEEKS)</Text>

          <ChartCard title="WEIGHT" icon="scale-outline" color={Colors.primary}>
            <LineChart data={weightData} color={Colors.primary} unit="kg" />
          </ChartCard>

          <ChartCard title="WAIST CIRCUMFERENCE" icon="resize-outline" color={Colors.blue}>
            <LineChart data={waistData} color={Colors.blue} unit="cm" />
          </ChartCard>

          <ChartCard title="DIET ADHERENCE" icon="nutrition-outline" color={Colors.amber}>
            <DietBar data={dietData} />
            <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm }}>
              {[['#4CAF50','≥ 90%'],[ Colors.amber,'70–89%'],[Colors.danger,'< 70%']].map(([c,l]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>{l}</Text>
                </View>
              ))}
            </View>
          </ChartCard>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header:    { flexDirection:'row', alignItems:'center', paddingHorizontal:Spacing.md, paddingBottom:Spacing.sm, borderBottomWidth:1, borderBottomColor:Colors.border },
  backBtn:   { width:40 },
  title:     { ...Typography.h2, color:Colors.textPrimary, flex:1, textAlign:'center' },
  content:   { padding:Spacing.md, gap:Spacing.md },
  sectionTitle: { ...Typography.label, color:Colors.textSecondary, textTransform:'uppercase', letterSpacing:1, fontSize:11 },

  // Log card
  logCard:   { backgroundColor:Colors.surface, borderRadius:Radius.lg, padding:Spacing.md, gap:Spacing.md, ...Shadows.card },
  weekRow:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:Colors.surfaceRaised, borderRadius:Radius.md, paddingVertical:Spacing.xs },
  weekArrow: { width:40, alignItems:'center', paddingVertical:Spacing.sm },
  weekLabel: { ...Typography.h3, color:Colors.textPrimary, flex:1, textAlign:'center' },

  // Metric input row
  metricRow:      { flexDirection:'row', alignItems:'center', gap:Spacing.md },
  metricLabel:    { ...Typography.label, color:Colors.textSecondary, width:120 },
  metricInputWrap:{ flex:1, flexDirection:'row', alignItems:'center', backgroundColor:Colors.surfaceRaised, borderRadius:Radius.md, paddingHorizontal:Spacing.md, height:44 },
  metricInput:    { flex:1, ...Typography.h3, color:Colors.textPrimary },
  metricUnit:     { ...Typography.bodySmall, color:Colors.textSecondary },

  saveBtn:    { height:52, borderRadius:Radius.full, backgroundColor:Colors.primary, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:Spacing.sm },
  saveBtnTxt: { ...Typography.h3, color:Colors.background, fontWeight:'700' },

  // Chart card
  chartCard:   { backgroundColor:Colors.surface, borderRadius:Radius.lg, padding:Spacing.md, gap:Spacing.sm, ...Shadows.card },
  chartHeader: { flexDirection:'row', alignItems:'center', gap:Spacing.xs },
  chartTitle:  { ...Typography.label, textTransform:'uppercase', letterSpacing:1, fontSize:11, flex:1 },
});
