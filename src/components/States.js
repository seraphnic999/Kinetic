/**
 * EmptyState / Skeleton — §7.7.
 *
 * Every empty state gets its own `empty*` glyph, one h3 line saying what is
 * missing, one body line saying what to do about it, and — where there is an
 * obvious next action — one button. No emoji.
 *
 * Loading gets skeleton rows rather than a centred spinner. A lone spinner on
 * a near-black screen with no surrounding chrome is indistinguishable from a
 * screen that has failed to load; a skeleton shows the shape of what is
 * coming, so the wait reads as progress rather than as a hang.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Colors, Typography, Spacing, Radius, IconSize, Touch, onAccent } from '../theme';
import { Icon } from './Icon';

export function EmptyState({
  icon = 'emptyChart',
  title,
  message,
  actionLabel,
  onAction,
  // Icons are never drawn in textFaint (theme.js) — at 1.5u on this ground the
  // set disappears. textMuted is the quietest an icon is allowed to go.
  tint = Colors.textMuted,
}) {
  return (
    <View style={s.empty}>
      <Icon name={icon} size={IconSize.empty} color={tint} />
      {title ? <Text style={s.title}>{title}</Text> : null}
      {message ? <Text style={s.msg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={s.action} onPress={onAction} activeOpacity={0.85}
                          accessibilityRole="button">
          <Text style={s.actionTxt}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** One shimmering block. Width accepts a number or a percentage string. */
export function SkeletonBar({ width = '100%', height = 14, radius = Radius.sm, style }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: Colors.raised, opacity }, style]}
    />
  );
}

/** `count` card-shaped placeholders, matching the row rhythm they stand in for. */
export function SkeletonList({ count = 4, lines = 2 }) {
  return (
    <View style={s.skelWrap}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.skelCard}>
          <SkeletonBar width={IconSize.row} height={IconSize.row} radius={Radius.sm} />
          <View style={s.skelText}>
            <SkeletonBar width={`${68 - i * 6}%`} height={16} />
            {lines > 1 ? <SkeletonBar width={`${44 + i * 5}%`} height={12} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: { ...Typography.h3, color: Colors.text, textAlign: 'center' },
  msg:   { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center' },
  action: {
    height: Touch.gym, paddingHorizontal: Spacing.xl, marginTop: Spacing.xs,
    borderRadius: Radius.md, backgroundColor: Colors.ember,
    alignItems: 'center', justifyContent: 'center',
  },
  actionTxt: { ...Typography.h3, color: onAccent },

  skelWrap: { padding: Spacing.md, gap: Spacing.sm },
  skelCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line,
    padding: Spacing.md, minHeight: Touch.gym,
  },
  skelText: { flex: 1, gap: Spacing.sm },
});
