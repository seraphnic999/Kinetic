/**
 * Dev → Icons — the proof sheet.
 *
 * Linked from nowhere and absent from any navigation: reached by long-pressing
 * the "Kinetic" wordmark on the session list. It draws every glyph in the set
 * at the three sizes that matter (22 / 26 / 30) on all three grounds and in all
 * three colours, plus a specimen of each type face.
 *
 * This exists because Cellar caught zero-sized and empty paths this way before
 * a single screen depended on its set, and because a font that failed to load
 * is invisible until you put it next to one that did — the specimen block at
 * the top is how you tell Barlow from the system fallback.
 *
 * docs/ICON-BRIEF.md §6 is the review matrix this screen renders.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Fonts, IconSize, Elevation } from '../theme';
import { Icon, ICON_NAMES } from '../components/Icon';

const GROUNDS = [
  { key: 'base',    label: 'base',    value: Colors.base },
  { key: 'surface', label: 'surface', value: Colors.surface },
  { key: 'raised',  label: 'raised',  value: Colors.raised },
];

const INKS = [
  { key: 'text',      label: 'text',      value: Colors.text },
  { key: 'ember',     label: 'ember',     value: Colors.ember },
  // NOT textFaint: a 1.5u stroke in #7A7A86 on near-black is the one place this
  // set disappears, so icons are never drawn in it (ICON-BRIEF.md §6).
  { key: 'textMuted', label: 'muted',     value: Colors.textMuted },
];

// The three sizes the set must hold. Anything that fails here fails on a phone.
const SIZES = [IconSize.meta, IconSize.row, IconSize.tab];

const FACES = [
  { family: Fonts.digits,        label: 'digits · DSEG7Classic',            sample: '01:47', size: 40 },
  { family: Fonts.display,       label: 'display · Barlow SC 700',          sample: 'INCLINE BENCH PRESS', size: 26 },
  { family: Fonts.displaySemi,   label: 'displaySemi · Barlow SC 600',      sample: '82.5 kg · 12.4 t', size: 22 },
  { family: Fonts.displayMedium, label: 'displayMedium · Barlow SC 500',    sample: 'Chest · Back · Legs', size: 20 },
  { family: Fonts.body,          label: 'body · Inter 400',                 sample: 'Under load for 41m of 1h 52m.', size: 16 },
  { family: Fonts.bodyMedium,    label: 'bodyMedium · Inter 500',           sample: 'Under load for 41m.', size: 16 },
  { family: Fonts.bodySemi,      label: 'bodySemi · Inter 600',             sample: 'TIME UNDER TENSION', size: 14 },
];

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.chipTxt, active && s.chipTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DevIconsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [ground, setGround] = useState(GROUNDS[1]);
  const [ink, setInk] = useState(INKS[0]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.base }}>
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>Dev · Icons</Text>
        <Text style={s.count}>{ICON_NAMES.length}</Text>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>

        {/* ── Type specimen ───────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Faces</Text>
        <View style={s.card}>
          {FACES.map((f, i) => (
            <View key={f.label} style={[s.faceRow, i > 0 && s.faceRowDivided]}>
              <Text style={s.faceLabel}>{f.label}</Text>
              <Text
                style={{ fontFamily: f.family, fontSize: f.size, color: Colors.text }}
                numberOfLines={1}
              >
                {f.sample}
              </Text>
            </View>
          ))}
          <Text style={s.faceNote}>
            If two of these look identical, one of them did not load and is
            falling back to the system face.
          </Text>
        </View>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Ground</Text>
        <View style={s.chipRow}>
          {GROUNDS.map(g => (
            <Chip key={g.key} label={g.label} active={ground.key === g.key} onPress={() => setGround(g)} />
          ))}
        </View>

        <Text style={s.sectionLabel}>Ink</Text>
        <View style={s.chipRow}>
          {INKS.map(c => (
            <Chip key={c.key} label={c.label} active={ink.key === c.key} onPress={() => setInk(c)} />
          ))}
        </View>

        {/* ── The matrix ──────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>
          Glyphs · {SIZES.join(' / ')} px on {ground.label} in {ink.label}
        </Text>

        {ICON_NAMES.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No glyphs yet</Text>
            <Text style={s.emptyTxt}>
              Drop the generated SVGs into assets/icons-src and run{'\n'}
              <Text style={s.mono}>npm run icons</Text>
            </Text>
          </View>
        ) : (
          <View style={[s.grid, { backgroundColor: ground.value }]}>
            {ICON_NAMES.map(name => (
              <View key={name} style={s.cell}>
                <View style={s.cellIcons}>
                  {SIZES.map(size => (
                    <Icon key={size} name={name} size={size} color={ink.value} />
                  ))}
                </View>
                <Text style={s.cellName} numberOfLines={1}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.footer}>
          The set must hold at every size on every ground. A glyph that only
          works at 30px on base is not finished — see docs/ICON-BRIEF.md §9.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back:    { width: 40 },
  backTxt: { ...Typography.h1, color: Colors.text, lineHeight: 34 },
  title:   { ...Typography.h2, color: Colors.text, flex: 1 },
  count:   { ...Typography.metric, color: Colors.ember },

  content:      { padding: Spacing.md, gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.md },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, ...Elevation.card,
  },

  faceRow:        { paddingVertical: Spacing.sm, gap: 2 },
  faceRowDivided: { borderTopWidth: 1, borderTopColor: Colors.line },
  faceLabel:      { ...Typography.caption, color: Colors.textFaint },
  faceNote:       { ...Typography.caption, color: Colors.textFaint, marginTop: Spacing.sm, lineHeight: 17 },

  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.raised, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
  },
  chipActive:    { backgroundColor: Colors.ember, borderColor: Colors.ember },
  chipTxt:       { ...Typography.bodySmall, color: Colors.textMuted },
  chipTxtActive: { ...Typography.bodySmall, color: Colors.base },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: Radius.lg, padding: Spacing.sm,
    borderWidth: 1, borderColor: Colors.line,
  },
  cell:      { width: '33.33%', alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.sm },
  cellIcons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: IconSize.tab },
  cellName:  { ...Typography.caption, color: Colors.textFaint, maxWidth: '96%' },

  empty:      { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyTitle: { ...Typography.h3, color: Colors.textMuted },
  emptyTxt:   { ...Typography.bodySmall, color: Colors.textFaint, textAlign: 'center', lineHeight: 22 },
  mono:       { ...Typography.bodySmall, color: Colors.ember },

  footer: { ...Typography.caption, color: Colors.textFaint, marginTop: Spacing.lg, lineHeight: 17 },
});
