/**
 * Sheet — a bottom sheet with a grabber, a scrim, and a swipe-down dismiss.
 *
 * Built for §7.2c: the set detail used to replace the whole screen, so the only
 * way back to the exercise list was a "Back to exercises" text link at the
 * bottom of a scroll view. You lost your place every time. A sheet keeps the
 * list visible and dimmed behind it, so "where was I" is never a question.
 *
 * Why `Modal` rather than an absolutely-positioned View: the Android hardware
 * back button has to close the sheet rather than abandon the session, and
 * `Modal` gives that for free via onRequestClose. It also escapes the parent's
 * overflow and transform context, which an in-tree overlay does not.
 *
 * The drag only ever moves the sheet DOWN (`dy > 0`). Letting it travel up
 * would detach it from the bottom of the screen and show the scrim underneath.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Animated, PanResponder,
  Pressable, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, IconSize, Motion, SCRIM } from '../theme';
import { Icon } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Past this many pixels, or this fast, the release closes rather than snaps back. */
const DISMISS_PX = 110;
const DISMISS_VY = 0.75;

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  iconColor = Colors.ember,
  /** Fraction of screen height the sheet occupies. §7.2c specifies ~78%. */
  height = 0.78,
  /** Rendered below the scroll area, outside the scroll — the fixed action bar. */
  footer,
  children,
}) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetH = Math.round(screenH * height);

  // One driver for both the slide and the scrim fade: 0 = closed, 1 = open.
  const anim = useRef(new Animated.Value(0)).current;
  // Drag offset, kept separate so a release can snap it back without fighting
  // the open/close animation.
  const drag = useRef(new Animated.Value(0)).current;

  // `Modal` unmounts the instant its `visible` goes false, which would skip the
  // exit animation entirely — the sheet would vanish rather than slide out.
  // So the Modal follows `mounted`, which lags `visible` by the animation.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? Motion.sheetIn : Motion.sheetOut,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    if (visible) drag.setValue(0);
  }, [visible, anim, drag]);

  const close = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0, duration: Motion.sheetOut, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) onClose?.(); });
  }, [anim, onClose]);

  const pan = useRef(
    PanResponder.create({
      // Claim the gesture only for a clear downward drag, so a vertical
      // ScrollView inside the sheet still scrolls normally.
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) drag.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_PX || g.vy > DISMISS_VY) {
          // Carry the drag through to the bottom rather than snapping back
          // first, which would read as the sheet bouncing before it leaves.
          Animated.timing(drag, {
            toValue: sheetH, duration: Motion.sheetOut, useNativeDriver: true,
          }).start(() => { onClose?.(); drag.setValue(0); });
        } else {
          Animated.spring(drag, {
            toValue: 0, useNativeDriver: true, bounciness: 0,
          }).start();
        }
      },
    }),
  ).current;

  const translateY = Animated.add(
    anim.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }),
    drag,
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close}
           statusBarTranslucent>
      <View style={st.fill}>
        <AnimatedPressable
          style={[st.scrim, { opacity: anim }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <Animated.View
          style={[
            st.sheet,
            { height: sheetH, paddingBottom: insets.bottom, transform: [{ translateY }] },
          ]}
        >
          {/* Grabber and header are the drag handle — not the whole sheet, or
              the drag would fight every control inside it. */}
          <View {...pan.panHandlers}>
            <View style={st.grabberWrap}>
              <View style={st.grabber} />
            </View>

            <View style={st.header}>
              <TouchableOpacity onPress={close} style={st.chevron} hitSlop={12}
                                accessibilityRole="button" accessibilityLabel="Close">
                <Icon name="chevronDown" size={IconSize.row} color={Colors.textMuted} />
              </TouchableOpacity>

              <View style={{ flex: 1, minWidth: 0 }}>
                {title ? <Text style={st.title} numberOfLines={1}>{title}</Text> : null}
                {subtitle ? <Text style={st.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
              </View>

              {icon ? <Icon name={icon} size={IconSize.section} color={iconColor} /> : null}
            </View>
          </View>

          <View style={st.body}>{children}</View>

          {footer ? <View style={st.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fill:  { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: SCRIM },

  sheet: {
    backgroundColor: Colors.base,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderTopWidth: 1, borderColor: Colors.line,
    overflow: 'hidden',
  },

  grabberWrap: { alignItems: 'center', paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  grabber: { width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.line },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  chevron:  { paddingRight: Spacing.xs },
  title:    { ...Typography.h2, color: Colors.text },
  subtitle: { ...Typography.bodySmall, color: Colors.textMuted },

  body:   { flex: 1, minHeight: 0 },
  footer: { borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.base },
});
