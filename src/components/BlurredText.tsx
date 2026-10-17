import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Canvas,
  Text as SkText,
  Blur,
  Circle,
  Rect,
  LinearGradient,
  matchFont,
  useFont,
  vec,
} from '@shopify/react-native-skia';

/**
 * Адрес, скрытый настоящим гауссовым размытием.
 *
 * Размытие рисуется на холсте Skia, а не системными средствами: раньше эффект
 * зависел от поддержки размытия устройством и на части телефонов вырождался в
 * обычную серую плашку.
 *
 * Внутри размытия медленно плавают синие шарики. Они вынесены в отдельный
 * холст, который двигается средствами Animated с нативным драйвером: движение
 * считает система, поэтому интерфейс не перерисовывается и не лагает.
 *
 * Края панели растворяются в карточке со всех четырёх сторон — градиенты в
 * тон карточки накладываются поверх содержимого.
 */

/**
 * Сила размытия адреса. Подобрана по макету: панель высотой 44 px, а размытие
 * шире панели обрезается её краями и превращается в бугристую полосу — именно
 * это и выглядело как «много квадратиков».
 */
const BLUR_SIGMA = 7;
/** Размытие шариков: применяется к каждому отдельно. */
const BUBBLE_BLUR = 5;
/** Ширина мягкого края в пикселях. */
const FADE = 12;
/** Запас по краям для дрейфа шариков, чтобы панель не «худела». */
const OVERSCAN = 14;
/**
 * Запас по вертикали для холста текста: без него размытие обрезается краем
 * холста, и у мягких краёв панели появляется резкая граница.
 */
const OVERHANG = 24;

interface BlurredTextProps {
  children: string;
  color: string;
  cardColor: string;
  accent: string;
  size?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Шарики: положение в долях панели, радиус и фаза. Считаем один раз при
 * загрузке модуля — на кадры это не влияет.
 */
const BUBBLES = Array.from({ length: 16 }, (_, i) => {
  const r1 = ((i * 9301 + 49297) % 233280) / 233280;
  const r2 = ((i * 4523 + 7919) % 104729) / 104729;
  const r3 = ((i * 1259 + 3571) % 65537) / 65537;
  return { x: r1, y: r2, r: 2 + r3 * 4, o: 0.35 + r1 * 0.3 };
});

export function BlurredText({
  children: text,
  color,
  cardColor,
  accent,
  size = 14,
  height = 34,
  style,
}: BlurredTextProps) {
  const [width, setWidth] = useState(0);
  const drift = useRef(new Animated.Value(0)).current;

  // Шрифт для холста. Сначала пробуем шрифт приложения: у Skia нет доступа к
  // системным семействам React Native. Если файл почему-то не загрузился,
  // берём системный шрифт — иначе текст не нарисуется вовсе и размытие
  // пропадёт целиком.
  const loadedFont = useFont(require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'), size);
  const fallbackFont = useMemo(() => {
    try {
      return matchFont({ fontFamily: 'Inter_400Regular', fontSize: size });
    } catch {
      return null;
    }
  }, [size]);
  const font = loadedFont ?? fallbackFont;

  // Медленный дрейф слоя шариков. Нативный драйвер: движение считает система,
  // JavaScript в это не вмешивается, поэтому перерисовок нет.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 11000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 11000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  // Обрезаем длинный адрес, чтобы он не вылезал за пределы панели.
  const perChar = size * 0.58;
  const maxChars = width > 0 ? Math.max(6, Math.floor((width - 24) / perChar)) : 32;
  const shown = text.length > maxChars ? `…${text.slice(-(maxChars - 1))}` : text;

  // Смещение по Y: центр строки внутри панели (baseline шрифта).
  const baseline = height / 2 + size * 0.36;

  /**
   * Положение текста по горизонтали. Адрес центрируется по панели: раньше он
   * рисовался от левого края, из-за чего размытое пятно было слева, и замок,
   * стоящий ровно по центру, казался смещённым вправо.
   */
  const textWidth = useMemo(() => {
    if (!font) return 0;
    try {
      return font.measureText(shown).width;
    } catch {
      return 0;
    }
  }, [font, shown]);

  const textX = width > 0 ? Math.max(0, (width - textWidth) / 2) : 0;

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [3, -3] });

  // Мягкий край делаем градиентом в тон карточки. Прозрачность задаём
  // шестнадцатеричным суффиксом, как это уже делается в графиках проекта:
  // слово "transparent" в Skia может дать непрозрачный чёрный.
  const solid = cardColor;
  const clear = `${cardColor}00`;

  return (
    <View
      style={[{ height, justifyContent: 'center' }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 0.5) setWidth(w);
      }}
    >
      {width > 0 ? (
        <>
          {/* Слой шариков: двигается целиком нативными средствами. Взят с
              запасом по краям, чтобы при дрейфе не оголялись углы. */}
          <View style={[styles.layer, { overflow: 'hidden' }]} pointerEvents="none">
            <Animated.View
              style={{
                position: 'absolute',
                left: -OVERSCAN,
                top: -OVERSCAN,
                width: width + OVERSCAN * 2,
                height: height + OVERSCAN * 2,
                transform: [{ translateX }, { translateY }],
              }}
            >
              <Canvas style={{ width: width + OVERSCAN * 2, height: height + OVERSCAN * 2 }}>
                {BUBBLES.map((b, i) => (
                  <Circle
                    key={i}
                    cx={OVERSCAN + b.x * width}
                    cy={OVERSCAN + b.y * height}
                    r={b.r}
                    color={accent}
                    opacity={b.o}
                  >
                    {/* Фильтр на каждом круге: размытие, заданное на группе,
                        у кругов не срабатывало — они рисовались резкими. */}
                    <Blur blur={BUBBLE_BLUR} />
                  </Circle>
                ))}
              </Canvas>
            </Animated.View>
          </View>

          {/* Слой текста. Холст выходит за пределы панели по вертикали: иначе
              размытие обрезается его краем и у мягких краёв появляется резкая
              граница — она и портила низ панели. */}
          <View style={styles.textLayer} pointerEvents="none">
            <Canvas style={{ width, height: height + OVERHANG * 2 }}>
              {/* Сам адрес: два прохода размытия, иначе буквы угадываются. */}
              <SkText x={textX} y={baseline + OVERHANG} text={shown} font={font} color={color} opacity={0.8}>
                <Blur blur={BLUR_SIGMA} />
              </SkText>
              <SkText x={textX} y={baseline + OVERHANG} text={shown} font={font} color={color} opacity={0.55}>
                <Blur blur={BLUR_SIGMA * 1.6} />
              </SkText>

              {/* Мягкие края: градиенты в тон карточки поверх содержимого,
                  поэтому панель растворяется со всех четырёх сторон. */}
              <Rect x={0} y={OVERHANG} width={width} height={FADE}>
                <LinearGradient start={vec(0, 0)} end={vec(0, FADE)} colors={[solid, clear]} />
              </Rect>
              <Rect x={0} y={OVERHANG + height - FADE} width={width} height={FADE}>
                <LinearGradient start={vec(0, 0)} end={vec(0, FADE)} colors={[clear, solid]} />
              </Rect>
              <Rect x={0} y={OVERHANG} width={FADE} height={height}>
                <LinearGradient start={vec(0, 0)} end={vec(FADE, 0)} colors={[solid, clear]} />
              </Rect>
              <Rect x={width - FADE} y={OVERHANG} width={FADE} height={height}>
                <LinearGradient start={vec(0, 0)} end={vec(FADE, 0)} colors={[clear, solid]} />
              </Rect>
            </Canvas>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** Холст текста выходит за панель на OVERHANG, чтобы размытие не резалось. */
  textLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -OVERHANG,
  },
});