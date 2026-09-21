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
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, useWindowDimensions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Typography, Spacing, Radius, IconSize, Touch } from '../theme';
import { Icon } from './Icon';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STROKE = 10;

/**
 * "45", "1:30" — not "00:45".
 *
 * `formatTime` always pads to MM:SS, and five characters of seven-segment do
 * not fit inside a ring that also has to fit the top third of the screen. Rest
 * is never hours, and the leading zeros carry nothing.
 */
const restLabel = (secs) => {
  const n = Math.max(0, Math.round(secs));
  if (n < 60) return String(n);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
/** Cap, not a constant: the whole hero must still fit the top third (§7.2b). */
const RING_MAX = 200;

export function RestHero({ secsLeft, totalSecs, nextLabel, nextSub, nextIcon, onSkip }) {
  const { height: screenH } = useWindowDimensions();
  // The ring plus its label, the next block and the skip button have to live
  // inside roughly a third of the screen, so the ring takes its share of that
  // rather than a fixed size that overruns short phones.
  const RING = Math.round(Math.min(RING_MAX, screenH * 0.21));
  const R = (RING - STROKE) / 2;
  const C = 2 * Math.PI * R;

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
      <View style={[s.ringWrap, { width: RING, height: RING }]}>
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

        <View style={[s.ringCentre, { paddingHorizontal: STROKE * 1.5 }]} pointerEvents="none">
          <Text style={s.label}>REST</Text>
          <Text
            style={[s.digits, { color: tone, fontSize: Math.round(RING * 0.34) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {restLabel(secsLeft)}
          </Text>
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

  ringWrap:   { alignItems: 'center', justifyContent: 'center' },
  // Longhand, NOT StyleSheet.absoluteFillObject — react-native 0.85 removed
  // it, and the spread of an undefined silently produced an unpositioned
  // view, which is why the countdown used to render below its own ring.
  ringCentre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                alignItems: 'center', justifyContent: 'center' },

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
