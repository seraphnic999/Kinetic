/**
 * The four-tab bar.
 *
 * A custom bar rather than the default one, for three reasons the design asks
 * for and React Navigation's does not give: the active tab swaps to a SOLID
 * glyph variant (so it reads without depending on colour alone), the glyphs are
 * 38px in an 80px bar, and the whole thing sits on `surface` with a single
 * `line` hairline instead of a platform shadow.
 *
 * docs/DESIGN.md §6.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, IconSize, Motion } from '../theme';
import { Icon } from './Icon';

/** route name → [resting glyph, active glyph, label] */
const TABS = {
  Train: ['tabTrain', 'tabTrainActive', 'Train'],
  Stats: ['tabStats', 'tabStatsActive', 'Stats'],
  Body:  ['tabBody',  'tabBodyActive',  'Body'],
  You:   ['tabYou',   'tabYouActive',   'You'],
};

export function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, i) => {
        const [icon, iconActive, label] = TABS[route.name] ?? [];
        if (!icon) return null;
        const focused = state.index === i;

        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={({ pressed }) => [s.tab, pressed && { opacity: Motion.pressOpacity }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
          >
            <Icon
              name={focused ? iconActive : icon}
              size={IconSize.tab}
              color={focused ? Colors.ember : Colors.textMuted}
            />
            <Text style={[s.label, focused && s.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  // 80px of content: a 38px glyph over an 11px label needs ~54px, and the rest
  // is the breathing room the old 72px bar did not have.
  tab: {
    flex: 1,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  label:       { ...Typography.label, fontSize: 10, color: Colors.textMuted },
  labelActive: { color: Colors.ember },
});
