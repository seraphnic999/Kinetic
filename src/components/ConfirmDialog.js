/**
 * ConfirmDialog — one modal confirmation, replacing three hand-rolled ones.
 *
 * §7.6: the same full-screen overlay was written out longhand in the training
 * screen, the session list and the editor, each with its own styles, its own
 * button order and its own idea of which action was destructive. Three copies
 * meant three chances to put "Discard" where the eye expects "Cancel".
 *
 * Actions are declared, not laid out by the caller. The dismissive action is
 * always first and always full-width, so the safe choice sits under the thumb
 * and the destructive one never occupies the position the muscle memory of the
 * previous screen points at.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, Radius, IconSize, Touch, Elevation, SCRIM, onAccent } from '../theme';
import { Icon } from './Icon';

/**
 * @param {object[]} actions  `{ label, onPress, tone }` where tone is
 *   'primary' (ember fill) · 'danger' (red outline) · 'ghost' (quiet outline).
 *   Rendered side by side beneath the dismiss button, in order.
 */
export function ConfirmDialog({
  visible, onDismiss,
  title, message, icon, iconColor = Colors.warn,
  dismissLabel = 'Cancel',
  actions = [],
}) {
  return (
    <Modal visible={visible} transparent animationType="fade"
           onRequestClose={onDismiss} statusBarTranslucent>
      <View style={s.scrim}>
        <View style={s.box}>
          {icon ? (
            <View style={s.iconWrap}>
              <Icon name={icon} size={IconSize.empty} color={iconColor} />
            </View>
          ) : null}

          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.msg}>{message}</Text> : null}

          <TouchableOpacity style={s.dismiss} onPress={onDismiss} activeOpacity={0.8}
                            accessibilityRole="button">
            <Text style={s.dismissTxt}>{dismissLabel}</Text>
          </TouchableOpacity>

          {actions.length ? (
            <View style={s.row}>
              {actions.map((a, i) => (
                <TouchableOpacity
                  key={a.label ?? i}
                  style={[s.btn, a.tone === 'primary' ? s.primary
                               : a.tone === 'danger'  ? s.danger : s.ghost]}
                  onPress={a.onPress}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Text style={[s.btnTxt,
                    a.tone === 'primary' ? { color: onAccent }
                    : a.tone === 'danger' ? { color: Colors.danger }
                    : { color: Colors.text }]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1, backgroundColor: SCRIM,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  box: {
    width: '100%', maxWidth: 420,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.line,
    padding: Spacing.xl, gap: Spacing.sm,
    ...Elevation.floating,
  },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.xs },

  title: { ...Typography.h2, color: Colors.text, textAlign: 'center' },
  msg:   { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center',
           marginBottom: Spacing.sm },

  // Full width and first, so the safe way out is the biggest target.
  dismiss: {
    height: Touch.gym, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.raised,
  },
  dismissTxt: { ...Typography.h3, color: Colors.text },

  row: { flexDirection: 'row', gap: Spacing.sm },
  btn: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    height: Touch.gym, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  btnTxt:  { ...Typography.h3 },
  primary: { backgroundColor: Colors.ember },
  danger:  { borderWidth: 1, borderColor: Colors.danger },
  ghost:   { borderWidth: 1, borderColor: Colors.line },
});
