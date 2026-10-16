import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Oval, RadialGradient, vec } from '@shopify/react-native-skia';
import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { FONT } from '../theme/colors';

type TabKey = string;

interface TabMeta {
  key: TabKey;
  label: string;
  icon: string;
  isFocused: boolean;
  onPress: () => void;
}

// Wide soft ellipse — reads as light under the tab, not a hard circle.
const GLOW_W = 200;
const GLOW_H = 90;
const ROW_H = 50;

// The glow is hidden at rest and only blooms while the selection travels
// between tabs; travel is slow and deliberate, the bloom itself is bright.
const MOVE_MS = 900;
const GROW_MS = 760;
const SETTLE_MS = 620;
const REST_OPACITY = 0;
const PEAK_OPACITY = 0.7;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function GlowTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, haptic } = useSettings();
  const insets = useSafeAreaInsets();

  const metas: TabMeta[] = state.routes.map((route, i) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === i;
    return {
      key: route.key,
      label: (options.tabBarLabel as string) ?? String(route.name),
      icon: iconForRoute(route.name),
      isFocused,
      onPress: () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(route.name as any);
        }
      },
    };
  });

  const layouts = useRef<Record<TabKey, number>>({}).current;
  const [widths, setWidths] = useState<Record<TabKey, number>>({});
  const prevIndex = useRef(state.index);

  // Left edge of the glow ellipse (centered under the active tab).
  const glowX = useRef(new Animated.Value(0)).current;
  const glowAlpha = useRef(new Animated.Value(REST_OPACITY)).current;
  const glowScaleX = useRef(new Animated.Value(1)).current;
  const glowScaleY = useRef(new Animated.Value(1)).current;
  // Extra shift so growth leans toward the travel direction.
  const glowLean = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const layoutReady = useRef(false);

  useEffect(() => {
    const focused = metas.find((m) => m.isFocused);
    if (!focused) return;
    const left = layouts[focused.key] ?? 0;
    const w = widths[focused.key] ?? 0;
    if (left === 0 && w === 0) return;

    const target = left + w / 2 - GLOW_W / 2;
    const dir = Math.sign(state.index - prevIndex.current) || 1;
    const moved = prevIndex.current !== state.index;
    prevIndex.current = state.index;

    animRef.current?.stop();

    if (!moved) {
      // First layout / width update — snap under the tab, soft rest state.
      glowX.setValue(target);
      glowAlpha.setValue(REST_OPACITY);
      glowScaleX.setValue(1);
      glowScaleY.setValue(1);
      glowLean.setValue(0);
      return;
    }

    // Start slightly small, lean opposite to travel so the bloom "grows into" the tab.
    glowScaleX.setValue(0.45);
    glowScaleY.setValue(0.55);
    glowLean.setValue(-dir * 28);
    glowAlpha.setValue(REST_OPACITY * 0.5);

    const easeOut = Easing.out(Easing.cubic);
    const easeInOut = Easing.inOut(Easing.cubic);

    animRef.current = Animated.parallel([
      Animated.timing(glowX, {
        toValue: target,
        duration: MOVE_MS,
        easing: easeInOut,
        useNativeDriver: true,
      }),
      Animated.timing(glowLean, {
        toValue: dir * 10,
        duration: MOVE_MS,
        easing: easeOut,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScaleX, {
            toValue: 1.35,
            duration: GROW_MS * 0.55,
            easing: easeOut,
            useNativeDriver: true,
          }),
          Animated.timing(glowScaleY, {
            toValue: 1.2,
            duration: GROW_MS * 0.55,
            easing: easeOut,
            useNativeDriver: true,
          }),
          Animated.timing(glowAlpha, {
            toValue: PEAK_OPACITY,
            duration: GROW_MS * 0.45,
            easing: easeOut,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(glowScaleX, {
            toValue: 1,
            duration: SETTLE_MS,
            easing: easeInOut,
            useNativeDriver: true,
          }),
          Animated.timing(glowScaleY, {
            toValue: 1,
            duration: SETTLE_MS,
            easing: easeInOut,
            useNativeDriver: true,
          }),
          Animated.timing(glowLean, {
            toValue: 0,
            duration: SETTLE_MS,
            easing: easeInOut,
            useNativeDriver: true,
          }),
          Animated.timing(glowAlpha, {
            toValue: REST_OPACITY,
            duration: SETTLE_MS,
            easing: easeInOut,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);
    animRef.current.start();
  }, [state.index, widths, metas, glowX, glowAlpha, glowScaleX, glowScaleY, glowLean, layouts]);

  // Pure soft glow — center is translucent, never a solid disc.
  const gradientColors = useMemo(
    () =>
      [
        hexToRgba(colors.accent, 0.6),
        hexToRgba(colors.accent, 0.32),
        hexToRgba(colors.accent, 0.12),
        hexToRgba(colors.accent, 0),
      ] as [string, string, string, string],
    [colors.accent],
  );
  const gradientPositions = useMemo<[number, number, number, number]>(
    () => [0, 0.28, 0.58, 1],
    [],
  );

  return (
    <View
      style={[
        styles.bar,
        {
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.divider,
        },
      ]}
      onLayout={() => {
        if (layoutReady.current) return;
        layoutReady.current = true;
        const focused = metas.find((m) => m.isFocused);
        if (focused) {
          const left = layouts[focused.key] ?? 0;
          const w = widths[focused.key] ?? 0;
          if (left || w) glowX.setValue(left + w / 2 - GLOW_W / 2);
        }
      }}
    >
      <View style={[styles.row, { height: ROW_H }]}>
        {/* Behind icons — soft underglow, not a foreground blob. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowWrap,
            {
              width: GLOW_W,
              height: GLOW_H,
              opacity: glowAlpha,
              transform: [
                { translateX: Animated.add(glowX, glowLean) },
                { scaleX: glowScaleX },
                { scaleY: glowScaleY },
              ],
            },
          ]}
        >
          <Canvas style={StyleSheet.absoluteFill}>
            <Oval x={0} y={0} width={GLOW_W} height={GLOW_H}>
              <RadialGradient
                c={vec(GLOW_W / 2, GLOW_H / 2)}
                r={GLOW_W * 0.52}
                colors={gradientColors}
                positions={gradientPositions}
              />
            </Oval>
          </Canvas>
        </Animated.View>

        {metas.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => {
              haptic();
              m.onPress();
            }}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              layouts[m.key] = x;
              if (widths[m.key] !== width) {
                const key = m.key;
                setWidths((prev) => ({ ...prev, [key]: width }));
              }
            }}
            style={styles.tab}
          >
            <Ionicons
              name={m.icon as any}
              size={24}
              color={m.isFocused ? colors.tabActive : colors.tabInactive}
            />
            <Text
              style={[
                styles.label,
                { color: m.isFocused ? colors.tabActive : colors.tabInactive },
              ]}
              numberOfLines={1}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function iconForRoute(name: string): string {
  switch (name) {
    case 'Home':
      return 'home-outline';
    case 'Section':
      return 'layers-outline';
    case 'Settings':
      return 'settings-outline';
    default:
      return 'ellipse-outline';
  }
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  glowWrap: {
    position: 'absolute',
    // Sit behind icons, vertically centered in the row.
    top: (ROW_H - GLOW_H) / 2,
    left: 0,
    zIndex: 0,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 3,
    zIndex: 1,
  },
  label: {
    fontFamily: FONT.medium,
    fontSize: 11,
    marginTop: 1,
  },
});
