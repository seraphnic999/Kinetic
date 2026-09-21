/**
 * Charts, on react-native-svg.
 *
 * What these replace: bars made of flex children, and a line chart made of
 * <View>s rotated by Math.atan2. That was genuinely clever and it had hit its
 * ceiling — no gridlines, no area fill, no curve, and a line that could only
 * label its own max and min. Since react-native-svg is already here for the
 * icon set, real paths cost nothing.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, Typography, Spacing, Radius, Elevation } from '../theme';
import { Icon } from './Icon';

const H = 120;
const PAD_R = 34;   // room for the value axis
const PAD_B = 18;   // room for the date axis

/** A titled card with an icon, the wrapper every chart sits in. */
export function ChartCard({ title, icon, subtitle, right, children, empty, emptyHint }) {
  return (
    <View style={c.card}>
      <View style={c.header}>
        {icon ? <Icon name={icon} size={22} color={Colors.textMuted} /> : null}
        <Text style={c.title}>{title}</Text>
        {subtitle ? <Text style={c.subtitle}>{subtitle}</Text> : null}
        {right}
      </View>
      {empty
        ? <Text style={c.empty}>{emptyHint ?? 'No data yet'}</Text>
        : children}
    </View>
  );
}

/** Evenly spaced horizontal rules plus the value labels that name them. */
function Grid({ w, max, min = 0, format }) {
  const steps = [0, 0.5, 1];
  return (
    <>
      {steps.map(t => {
        const y = PAD_B + (1 - t) * (H - PAD_B - 8);
        const v = min + (max - min) * t;
        return (
          <React.Fragment key={t}>
            <Line x1={0} y1={y} x2={w - PAD_R} y2={y}
                  stroke={Colors.line} strokeWidth={1} />
          </React.Fragment>
        );
      })}
    </>
  );
}

function AxisLabels({ w, max, min = 0, format }) {
  // c.fill is written longhand: RN 0.85 removed StyleSheet.absoluteFill, and
  // `style={undefined}` left this wrapper unpositioned, so the value axis was
  // laid out below the plot instead of over it.
  return (
    <View style={c.fill} pointerEvents="none">
      {[0, 0.5, 1].map(t => {
        const y = PAD_B + (1 - t) * (H - PAD_B - 8);
        return (
          <Text key={t} style={[c.axis, { position: 'absolute', right: 0, top: y - 8, width: PAD_R - 4 }]}>
            {format(min + (max - min) * t)}
          </Text>
        );
      })}
    </View>
  );
}

function DateAxis({ data }) {
  if (data.length < 2) return null;
  return (
    <View style={c.dateRow}>
      <Text style={c.axis}>{data[0].label}</Text>
      <Text style={c.axis}>{data[data.length - 1].label}</Text>
    </View>
  );
}

/**
 * Weekly bars, with an optional rolling-average line over them.
 * The final bar is the current week and is drawn hot — it is the only one
 * still moving.
 */
export function BarChart({ data, overlay, color = Colors.ember, format = String }) {
  const [w, setW] = useState(0);
  if (!data?.length) return null;

  const max = Math.max(...data.map(d => d.value), ...(overlay ?? []).map(d => d.value), 1);
  const plotW = Math.max(0, w - PAD_R);
  const plotH = H - PAD_B - 8;
  const slot = plotW / data.length;
  const bw = Math.max(3, slot * 0.62);

  const line = overlay?.length
    ? overlay.map((d, i) => {
        const x = i * slot + slot / 2;
        const y = PAD_B + plotH - (d.value / max) * plotH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join('')
    : null;

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={{ height: H }}>
        {w > 0 && (
          <Svg width={w} height={H}>
            <Grid w={w} max={max} />
            {data.map((d, i) => {
              const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0;
              const last = i === data.length - 1;
              return (
                <Rect
                  key={d.key ?? i}
                  x={i * slot + (slot - bw) / 2}
                  y={PAD_B + plotH - h}
                  width={bw}
                  height={h}
                  rx={2}
                  fill={last ? color : color + '55'}
                />
              );
            })}
            {line ? (
              <Path d={line} fill="none" stroke={Colors.gold} strokeWidth={2}
                    strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
          </Svg>
        )}
        {w > 0 && <AxisLabels w={w} max={max} format={format} />}
      </View>
      <DateAxis data={data} />
    </View>
  );
}

/**
 * A line with an area fill, and an optional dimmed secondary series — used to
 * show the raw best set under the e1RM estimate, so you can see HOW the
 * estimate moved.
 */
export function LineChart({ data, secondary, color = Colors.ember, format = String, domain }) {
  const [w, setW] = useState(0);
  if (!data?.length) return null;

  const values = [...data.map(d => d.value), ...(secondary ?? []).map(d => d.value)];
  const lo = domain?.[0] ?? Math.min(...values);
  const hi = domain?.[1] ?? Math.max(...values);
  const pad = (hi - lo) * 0.12 || 1;
  const min = domain ? lo : lo - pad;
  const max = domain ? hi : hi + pad;

  const plotW = Math.max(0, w - PAD_R);
  const plotH = H - PAD_B - 8;
  const x = i => (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = v => PAD_B + plotH - ((v - min) / (max - min || 1)) * plotH;

  const path = s => s.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join('');
  const area = `${path(data)}L${x(data.length - 1).toFixed(1)} ${PAD_B + plotH}L${x(0).toFixed(1)} ${PAD_B + plotH}Z`;

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={{ height: H }}>
        {w > 0 && (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.28" />
                <Stop offset="1" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Grid w={w} max={max} min={min} />
            {data.length > 1 ? <Path d={area} fill="url(#fade)" /> : null}
            {secondary?.length > 1 ? (
              <Path d={path(secondary)} fill="none" stroke={Colors.textFaint}
                    strokeWidth={1.5} strokeDasharray="4 4" strokeLinejoin="round" />
            ) : null}
            {data.length > 1 ? (
              <Path d={path(data)} fill="none" stroke={color} strokeWidth={2.5}
                    strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            <Circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r={4} fill={color} />
          </Svg>
        )}
        {w > 0 && <AxisLabels w={w} max={max} min={min} format={format} />}
      </View>
      <DateAxis data={data} />
    </View>
  );
}

const c = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, ...Elevation.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  title: { ...Typography.label, color: Colors.textMuted, flex: 1 },
  subtitle: { ...Typography.caption, color: Colors.textFaint },
  empty: { ...Typography.bodySmall, color: Colors.textFaint, textAlign: 'center', paddingVertical: Spacing.xl },
  axis: { ...Typography.caption, color: Colors.textFaint, textAlign: 'right' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: PAD_R },
});
