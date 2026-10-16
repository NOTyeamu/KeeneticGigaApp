import { Pressable, StyleSheet, Text, View, Image, Animated, Easing, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';
import { Card } from './Card';
import type { SectionGroup, SubItem } from '../data/sections';

// Страницы, доведённые до паритета с веб-интерфейсом; остальные помечаются «Скоро».
const DONE_PAGES = new Set(['SystemMonitor', 'TrafficMonitor', 'WifiMonitor', 'Ethernet']);

interface SectionCardProps {
  section: SectionGroup;
  onOpenItem: (item: SubItem) => void;
  defaultExpanded?: boolean;
}

const ANIM_DURATION = 260;

export function SectionCard({ section, onOpenItem, defaultExpanded = true }: SectionCardProps) {
  const { colors, haptic } = useSettings();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(0);
  const anim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;
  const chevron = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  // Keep the animated value in sync if the section default changes between
  // search-mode toggles (component re-mounts with different defaultExpanded).
  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, {
        toValue: defaultExpanded ? 1 : 0,
        duration: 0,
        useNativeDriver: false,
      }),
      Animated.timing(chevron, {
        toValue: defaultExpanded ? 1 : 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [defaultExpanded, anim, chevron]);

  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - contentHeight) > 0.5) setContentHeight(h);
  };

  const toggle = () => {
    haptic();
    setExpanded((e) => !e);
    Animated.parallel([
      Animated.timing(anim, {
        toValue: expanded ? 0 : 1,
        duration: ANIM_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(chevron, {
        toValue: expanded ? 0 : 1,
        duration: ANIM_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Until the content height is measured, render at natural size so onLayout
  // fires reliably (a 0-height wrapper suppresses layout of its children).
  const animatedHeight =
    contentHeight > 0 ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }) : undefined;
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const chevronRot = chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Pressable
        onPress={toggle}
        android_ripple={{ color: colors.accentSoft, borderless: false }}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.iconBox}>
          {section.iconAsset ? (
            <Image source={section.iconAsset} style={[styles.iconImage, { tintColor: colors.accent }]} resizeMode="contain" />
          ) : (
            <Ionicons name={section.icon as any} size={44} color={colors.accent} style={{ position: 'absolute' }} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: -6 }}>
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 17, color: colors.text }}>{section.title}</Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
            {section.description}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: chevronRot }] }}>
          <Ionicons name="chevron-down-outline" size={20} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      <Animated.View style={{ height: animatedHeight, overflow: 'hidden' }}>
        <Animated.View
          style={{ opacity }}
          onLayout={onContentLayout}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <View style={{ paddingHorizontal: 0, paddingBottom: 6 }}>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginHorizontal: Spacing.md }} />
            {section.items.map((item, i) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  haptic();
                  onOpenItem(item);
                }}
                android_ripple={{ color: colors.accentSoft, borderless: false }}
                style={({ pressed }) => [styles.subItem, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={item.icon as any} size={18} color={colors.textSecondary} />
                <Text style={{ flex: 1, marginLeft: 12, fontFamily: FONT.regular, fontSize: 15, color: colors.text }}>
                  {item.title}
                </Text>
                {!DONE_PAGES.has(item.page) ? (
                  <View
                    style={{
                      backgroundColor: colors.accentSoft,
                      borderRadius: Radius.pill,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.medium, fontSize: 10, color: colors.accent }}>Скоро</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                {i < section.items.length - 1 ? (
                  <View style={[styles.subDivider, { backgroundColor: colors.divider }]} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 12,
  },
  iconBox: {
    // Фиксированный слот 44x44: крупная иконка выходит за его границы
    // (overflow) и не влияет на положение текста справа.
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconImage: {
    // Визуально крупная (2x слота), позиционируется абсолютно по центру слота -
    // вёрстка строки и текст от её размера не зависят.
    position: 'absolute',
    width: 88,
    height: 88,
    top: -22,
    left: -22,
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    minHeight: 50,
  },
  subDivider: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
