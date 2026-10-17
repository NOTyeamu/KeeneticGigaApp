import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Text as SkText, Blur, useFont } from '@shopify/react-native-skia';

/**
 * Текст, размытый настоящим гауссовым размытием.
 *
 * Размытие рисуется на холсте Skia, а не системными средствами: раньше эффект
 * зависел от поддержки размытия устройством и на части телефонов вырождался в
 * обычную серую плашку. Здесь же текст рисуется шрифтом и размывается фильтром
 * Skia — «мыло» получается одинаковым везде.
 */

/** Подобрано так, чтобы буквы сливались в пятно, но угадывались очертания. */
const BLUR_SIGMA = 9;

interface BlurredTextProps {
  children: string;
  color: string;
  size?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function BlurredText({
  children: text,
  color,
  size = 14,
  height = 34,
  style,
}: BlurredTextProps) {
  const [width, setWidth] = useState(0);

  // Свой шрифт: у Skia нет доступа к системным семействам React Native.
  const font = useFont(require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'), size);

  // Обрезаем длинный адрес, чтобы он не вылезал за пределы панели.
  const perChar = size * 0.58;
  const maxChars = width > 0 ? Math.max(6, Math.floor((width - 16) / perChar)) : 32;
  const shown = text.length > maxChars ? `…${text.slice(-(maxChars - 1))}` : text;

  // Смещение по Y: центр строки внутри панели (baseline шрифта).
  const baseline = height / 2 + size * 0.36;

  return (
    <View
      style={[{ height, justifyContent: 'center' }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 0.5) setWidth(w);
      }}
    >
      {width > 0 ? (
        <Canvas style={[StyleSheet.absoluteFill, { width, height }]}>
          {/* Два прохода размытия подряд: одного мало, буквы угадываются. */}
          <SkText x={8} y={baseline} text={shown} font={font} color={color} opacity={0.85}>
            <Blur blur={BLUR_SIGMA} mode="clamp" />
          </SkText>
          <SkText x={8} y={baseline} text={shown} font={font} color={color} opacity={0.6}>
            <Blur blur={BLUR_SIGMA * 2} mode="clamp" />
          </SkText>
        </Canvas>
      ) : null}
    </View>
  );
}