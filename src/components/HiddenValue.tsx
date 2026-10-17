import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';
import { BlurPanel } from './BlurPanel';

const ANIM_MS = 320;

interface HiddenValueProps {
  value: string;
  hint?: string;
  /** Кнопка «Изменить» рядом со значением. */
  onChangePress?: () => void;
}

/**
 * Адрес роутера, скрытый размытием.
 *
 * Пока значение скрыто, самого адреса в разметке нет — вместо него панель с
 * плавающими шариками (см. BlurPanel). Подглядывать нечего, поэтому панель
 * надёжнее любого размытия: раньше адрес рисовался размытым, и всё ломалось
 * то на шрифте, то на фильтре размытия.
 *
 * Касание — размытие сходит и адрес проявляется. Долгое нажатие копирует.
 */
export function HiddenValue({ value, hint, onChangePress }: HiddenValueProps) {
  const { colors, haptic } = useSettings();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const reveal = useRef(new Animated.Value(0)).current;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const toggle = () => {
    haptic();
    const next = !revealed;
    setRevealed(next);
    Animated.timing(reveal, {
      toValue: next ? 1 : 0,
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    haptic(18);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  // Панель гаснет, а чёткий адрес проявляется ей на смену.
  const blurOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const textOpacity = reveal.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });

  return (
    <View>
      <Pressable
        onPress={toggle}
        onLongPress={copy}
        delayLongPress={350}
        android_ripple={{ color: colors.accentSoft }}
        style={styles.stack}
        accessibilityRole="button"
        accessibilityLabel={revealed ? 'Скрыть адрес роутера' : 'Показать адрес роутера'}
        accessibilityHint="Долгое нажатие копирует адрес"
      >
        {/* Чёткий адрес — проявляется при раскрытии. */}
        <Animated.View style={{ opacity: textOpacity }} pointerEvents="none">
          <Text
            style={[styles.value, { color: copied ? colors.online : colors.text }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {copied ? 'Скопировано ✓' : value}
          </Text>
        </Animated.View>

        {/* Панель без значения внутри: пока оно скрыто, рисовать нечего,
            поэтому подглядывать нечего. При раскрытии точки разлетаются
            из центра, а значок гаснет вместе с ними. */}
        <View style={styles.blurLayer} pointerEvents="none">
          <BlurPanel
            cardColor={colors.card}
            accent={colors.accent}
            height={PANEL_H}
            reveal={reveal}
          />
          <Animated.View style={[styles.centerIcon, { opacity: blurOpacity }]} pointerEvents="none">
            <Ionicons
              name="eye-off-outline"
              size={17}
              color={colors.text}
              style={styles.centerIconGlyph}
            />
          </Animated.View>
        </View>
      </Pressable>

      {hint || onChangePress ? (
        <View style={styles.bottomRow}>
          {hint ? (
            <Text style={[styles.hint, { color: colors.textMuted }]} numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
          {onChangePress ? (
            <Pressable
              onPress={() => {
                haptic();
                onChangePress();
              }}
              hitSlop={8}
            >
              <Text style={[styles.changeLink, { color: colors.accent }]}>Изменить</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Высота панели: подобрана по макету — размытию нужно место, иначе оно
 *  обрезается краями и выглядит бугристой полосой. */
const PANEL_H = 44;

const styles = StyleSheet.create({
  stack: {
    height: PANEL_H,
    justifyContent: 'center',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  value: {
    fontFamily: FONT.medium,
    fontSize: 14,
    paddingHorizontal: 8,
  },
  blurLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PANEL_H,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  centerIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Иконки из шрифта на Android несут лишний вертикальный отступ
   * (includeFontPadding), из-за чего внутри центрирующей рамки значок встаёт
   * ниже центра. Отключаем этот отступ — значок встаёт по центру.
   */
  centerIconGlyph: {
    includeFontPadding: false,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  hint: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 11,
  },
  changeLink: {
    fontFamily: FONT.semiBold,
    fontSize: 12,
    marginLeft: 10,
  },
});