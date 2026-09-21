/**
 * RestHero — the rest countdown, at the size it actually matters.
 *
 * §7.2b, and the single largest usability change in the redesign. The number
 * you most need to read from two metres away — phone face-up on the bench, you
 * standing over it — was previously the third-smallest thing on the screen: a
 * 30px readout in the corner of the header, next to a session timer it was
 * easy to confuse with.
 *
 * So it takes the top third of the screen, in ice, at 76px, inside a ring that
 * drains. §2.2's rule applies while it is lit: ice means WAITING, and ember
 * goes cold everywhere else on the screen so there is exactly one live colour
 * at a time. Naming what comes next matters as much as the count — resting is
 * when you decide whether the next set is the one you add weight to.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Typography, Spacing, Radius, IconSize, Touch } from '../theme';
import { Icon } from './Icon';
import { formatTime } from '../utils/time';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 210;      // svg viewport, square
const STROKE = 10;
const R = (RING - STROKE) / 2;
const C = 2 * Math.PI * R;

export function RestHero({ secsLeft, totalSecs, nextLabel, nextSub, nextIcon, onSkip }) {
  const total = Math.max(1, totalSecs || 1);
  // Drain, not fill: the ring empties as the rest runs out, so "nearly gone"
  // is a nearly-empty ring rather than a nearly-full one.
  const frac = Math.max(0, Math.min(1, secsLeft / total));

  // Animate the dash offset rather than re-rendering a new stroke each second,
  // so the ring sweeps smoothly instead of ticking in 1/total jumps.
  const sweep = useRef(new Animated.Value(frac)).current;
  useEffect(() => {
    Animated.timing(sweep, {
      toValue: frac, duration: 950, easing: Easing.linear, useNativeDriver: false,
    }).start();
  }, [frac, sweep]);

  const dashOffset = sweep.interpolate({ inputRange: [0, 1], outputRange: [C, 0] });

  // Under ten seconds the count is the only thing that matters, so it warms
  // toward ember — the one place the two channels legitimately meet, because
  // it is the handover: waiting is ending, lifting is about to start.
  const urgent = secsLeft <= 10;
  const tone = urgent ? Colors.emberHot : Colors.ice;

  return (
    <View style={s.wrap}>
      <View style={s.ringWrap}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2} cy={RING / 2} r={R}
            stroke={Colors.line} strokeWidth={STROKE} fill="none"
          />
          <AnimatedCircle
            cx={RING / 2} cy={RING / 2} r={R}
            stroke={tone} strokeWidth={STROKE} fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            // Start the sweep at twelve o'clock rather than three.
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>

        <View style={s.ringCentre} pointerEvents="none">
          <Text style={s.label}>REST</Text>
          <Text style={[s.digits, { color: tone }]}>{formatTime(Math.max(0, secsLeft))}</Text>
        </View>
      </View>

      {nextLabel ? (
        <View style={s.next}>
          <Text style={s.nextLabel}>NEXT</Text>
          <View style={s.nextRow}>
            {nextIcon ? <Icon name={nextIcon} size={IconSize.row} color={Colors.textMuted} /> : null}
            <Text style={s.nextName} numberOfLines={1}>{nextLabel}</Text>
          </View>
          {nextSub ? <Text style={s.nextSub} numberOfLines={1}>{nextSub}</Text> : null}
        </View>
      ) : null}

      <TouchableOpacity style={s.skip} onPress={onSkip} activeOpacity={0.8}
                        accessibilityRole="button" accessibilityLabel="Skip rest">
        <Icon name="forward" size={IconSize.meta} color={Colors.ice} />
        <Text style={s.skipTxt}>SKIP REST</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.md },

  ringWrap:   { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCentre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  label:  { ...Typography.label, color: Colors.textFaint, marginBottom: Spacing.xs },
  digits: { ...Typography.timerHero },

  next:      { alignItems: 'center', gap: 2 },
  nextLabel: { ...Typography.label, color: Colors.textFaint },
  nextRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nextName:  { ...Typography.h2, color: Colors.text },
  nextSub:   { ...Typography.bodySmall, color: Colors.textMuted },

  skip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: Touch.gym, paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.ice,
  },
  skipTxt: { ...Typography.h3, color: Colors.ice },
});
