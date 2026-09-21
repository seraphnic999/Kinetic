/**
 * You — account, defaults and export.
 *
 * Three of these had no home before: the account sheet was reached by tapping
 * your own email address on the session list, the default rest timer was only
 * editable per-session inside the editor, and CSV export existed solely on the
 * Summary screen — seen once after training, never reachable again.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Colors, Typography, Spacing, Radius, IconSize, Elevation, Touch, onAccent,
} from '../theme';
import { Icon } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { useAuth, signOut } from '../hooks/useAuth';
import { shareHistoryCsv } from '../utils/exportHistory';
import { loadSessions } from '../utils/storage';
import { getPrefs, setPref, DEFAULTS } from '../utils/prefs';

function Row({ icon, label, value, onPress, tint = Colors.textMuted, children, last }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      style={[s.row, !last && s.rowDivided]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Icon name={icon} size={IconSize.meta} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
      </View>
      {children}
      {onPress && !children ? (
        <Icon name="chevronRight" size={IconSize.meta} color={Colors.textMuted} />
      ) : null}
    </Wrap>
  );
}

export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const { session: auth } = useAuth();
  const email = auth?.user?.email ?? '';

  const [prefs, setPrefs] = useState(DEFAULTS);
  const [sessionCount, setSessionCount] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getPrefs().then(p => { if (alive) setPrefs(p); });
    loadSessions().then(v => { if (alive) setSessionCount(v.length); });
    return () => { alive = false; };
  }, []));

  const update = async (key, value) => {
    setPrefs(p => ({ ...p, [key]: value }));
    await setPref(key, value);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const { sessions, rows } = await shareHistoryCsv();
      if (sessions === 0) Alert.alert('Nothing to export', 'No synced sessions yet.');
    } catch (e) {
      Alert.alert('Export failed', e?.message ?? String(e));
    } finally {
      setExporting(false);
    }
  };

  const doSignOut = () => Alert.alert(
    'Sign out?',
    'Your sessions are saved to your account — they come back when you sign in again.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => { setSigningOut(true); await signOut(); setSigningOut(false); },
      },
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.base }}>
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={s.title}>You</Text>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Spacing.xxl }]}>

        <Text style={s.section}>Account</Text>
        <View style={s.card}>
          <Row icon="mail" label="Signed in as" value={email || 'unknown'} last />
        </View>

        <Text style={s.section}>Training defaults</Text>
        <View style={s.card}>
          <Row icon="timer" label="Rest timer" value={`${prefs.restTimerSecs}s between sets`}>
            <Stepper
              value={prefs.restTimerSecs}
              onChange={v => update('restTimerSecs', v)}
              min={15}
              max={600}
              step={15}
              fillRow={false}
            />
          </Row>
          <Row icon="intervals" label="Sounds" value="Beep on rest and interval changes">
            <Switch
              value={prefs.sounds}
              onValueChange={v => update('sounds', v)}
              trackColor={{ false: Colors.raised, true: Colors.emberDim }}
              thumbColor={prefs.sounds ? Colors.ember : Colors.textFaint}
            />
          </Row>
          <Row icon="bell" label="Notifications" value="Alert when a timer finishes" last>
            <Switch
              value={prefs.notifications}
              onValueChange={v => update('notifications', v)}
              trackColor={{ false: Colors.raised, true: Colors.emberDim }}
              thumbColor={prefs.notifications ? Colors.ember : Colors.textFaint}
            />
          </Row>
        </View>

        <Text style={s.section}>Data</Text>
        <View style={s.card}>
          <Row
            icon="export"
            label="Export training history"
            value="Every synced session, one row per exercise"
            onPress={exporting ? undefined : doExport}
            tint={Colors.ember}
          >
            {exporting ? <ActivityIndicator color={Colors.ember} /> : null}
          </Row>
          <Row
            icon="barbell"
            label="Saved sessions"
            value={sessionCount == null ? '—' : `${sessionCount} on this device`}
            last
          />
        </View>

        <TouchableOpacity
          style={s.signOut}
          onPress={doSignOut}
          disabled={signingOut}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {signingOut
            ? <ActivityIndicator color={Colors.danger} />
            : <>
                <Icon name="signOut" size={IconSize.meta} color={Colors.danger} />
                <Text style={s.signOutTxt}>Sign out</Text>
              </>}
        </TouchableOpacity>

        <Text style={s.footer}>Kinetic · units in kg, with pounds alongside</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  title:   { ...Typography.h1, color: Colors.text },
  content: { padding: Spacing.md, gap: Spacing.sm },
  section: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.lg },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, ...Elevation.card },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    minHeight: Touch.min,
  },
  rowDivided: { borderBottomWidth: 1, borderBottomColor: Colors.line },
  rowLabel: { ...Typography.body, color: Colors.text },
  rowValue: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },

  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: Touch.gym, marginTop: Spacing.xl,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.danger,
  },
  signOutTxt: { ...Typography.h3, color: Colors.danger },

  footer: {
    ...Typography.caption, color: Colors.textFaint,
    textAlign: 'center', marginTop: Spacing.lg,
  },
});
