import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Canvas,
  Text as SkText,
  Blur,
  Circle,
  Group,
  Mask,
  Rect,
  LinearGradient,
  useFont,
  vec,
} from '@shopify/react-native-skia';

/**
 * Адрес, скрытый настоящим гауссовым размытием.
 *
 * Размытие рисуется на холсте Skia, а не системными средствами: раньше эффект
 * зависел от поддержки размытия устройством и на части телефонов вырождался в
 * обычную серую плашку. Фильтр Skia даёт одинаковое «мыло» везде.
 *
 * Внутри размытия медленно плавают синие шарики — они тоже размыты, поэтому
 * панель выглядит живой, но прочитать адрес всё равно нельзя.
 *
 * Края сходят на нет со всех четырёх сторон: две маски с градиентами
 * накладываются друг на друга, и их прозрачность перемножается.
 */

/** Подобрано так, чтобы буквы сливались в пятно, но угадывались очертания. */
const BLUR_SIGMA = 9;
/** Мягкость краёв: доля высоты/ширины, на которой панель растворяется. */
const FADE_X = 0.07;
const FADE_Y = 0.28;

interface BlurredTextProps {
  children: string;
  color: string;
  accent: string;
  size?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Заранее посчитанные шарики: положение в долях панели, радиус и скорость.
 * Считаем один раз при загрузке модуля, чтобы не пересчитывать на каждом кадре.
 */
const BUBBLES = Array.from({ length: 18 }, (_, i) => {
  const r1 = ((i * 9301 + 49297) % 233280) / 233280;
  const r2 = ((i * 4523 + 7919) % 104729) / 104729;
  const r3 = ((i * 1259 + 3571) % 65537) / 65537;
  return {
    x: r1,
    y: r2,
    r: 2 + r3 * 4.5,
    speed: 0.012 + r2 * 0.02,
    phase: r1 * Math.PI * 2,
  };
});

export function BlurredText({
  children: text,
  color,
  accent,
  size = 14,
  height = 34,
  style,
}: BlurredTextProps) {
  const [width, setWidth] = useState(0);
  const [time, setTime] = useState(0);

  // Свой шрифт: у Skia нет доступа к системным семействам React Native.
  const font = useFont(require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'), size);

  // Плавный дрейф шариков: около 20 кадров в секунду — этого хватает для
  // «живого» размытия и не нагружает телефон.
  useEffect(() => {
    const id = setInterval(() => setTime((t) => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  // Обрезаем длинный адрес, чтобы он не вылезал за пределы панели.
  const perChar = size * 0.58;
  const maxChars = width > 0 ? Math.max(6, Math.floor((width - 16) / perChar)) : 32;
  const shown = text.length > maxChars ? `…${text.slice(-(maxChars - 1))}` : text;

  // Смещение по Y: центр строки внутри панели (baseline шрифта).
  const baseline = height / 2 + size * 0.36;

  // Мягкие края сверху и снизу.
  const verticalMask = (
    <Rect x={0} y={0} width={width} height={height}>
      <LinearGradient
        start={vec(0, 0)}
        end={vec(0, height)}
        colors={['transparent', 'black', 'black', 'transparent']}
        positions={[0, FADE_Y, 1 - FADE_Y, 1]}
      />
    </Rect>
  );

  // Мягкие края слева и справа.
  const horizontalMask = (
    <Rect x={0} y={0} width={width} height={height}>
      <LinearGradient
        start={vec(0, 0)}
        end={vec(width, 0)}
        colors={['transparent', 'black', 'black', 'transparent']}
        positions={[0, FADE_X, 1 - FADE_X, 1]}
      />
    </Rect>
  );

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
          {/* Маски вложены: их прозрачность перемножается, поэтому панель
              растворяется по всем четырём краям сразу. */}
          <Mask mask={verticalMask} mode="alpha">
            <Mask mask={horizontalMask} mode="alpha">
              {/* Синие шарики: один фильтр размытия на всех — так дешевле. */}
              <Group>
                <Blur blur={7} mode="clamp" />
                {BUBBLES.map((b, i) => {
                  const dx = Math.sin(time * b.speed + b.phase) * width * 0.05;
                  const dy = Math.cos(time * b.speed * 0.8 + b.phase) * height * 0.2;
                  return (
                    <Circle
                      key={i}
                      cx={b.x * width + dx}
                      cy={b.y * height + dy}
                      r={b.r}
                      color={accent}
                      opacity={0.45}
                    />
                  );
                })}
              </Group>

              {/* Сам адрес: два прохода размытия, иначе буквы угадываются. */}
              <SkText x={8} y={baseline} text={shown} font={font} color={color} opacity={0.85}>
                <Blur blur={BLUR_SIGMA} mode="clamp" />
              </SkText>
              <SkText x={8} y={baseline} text={shown} font={font} color={color} opacity={0.6}>
                <Blur blur={BLUR_SIGMA * 2} mode="clamp" />
              </SkText>
            </Mask>
          </Mask>
        </Canvas>
      ) : null}
    </View>
  );
}