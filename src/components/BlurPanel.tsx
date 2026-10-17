import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Circle, RadialGradient, Rect, LinearGradient, vec } from '@shopify/react-native-skia';

/**
 * Панель, скрывающая значение.
 *
 * Адреса внутри нет вообще: пока значение скрыто, рисовать нечего, поэтому
 * подглядывать нечего — это надёжнее любого размытия. Раньше здесь рисовался
 * размытый текст, и всё ломалось то на шрифте, то на фильтре размытия.
 *
 * Внутри панели медленно плавают синие шарики. Они мягкие за счёт радиального
 * градиента, а не фильтра размытия: этот приём уже работает в приложении —
 * на нём сделано свечение нижней панели вкладок.
 *
 * Используются только те средства Skia, что проверены в проекте: Canvas,
 * Circle, RadialGradient, Rect, LinearGradient, vec.
 */

/** Мягкость края панели в пикселях. */
const FADE = 12;
/** Запас по краям для дрейфа шариков, чтобы панель не «худела». */
const OVERSCAN = 18;

interface BlurPanelProps {
  /** Цвет карточки, в которую вписана панель: в него растворяются края. */
  cardColor: string;
  accent: string;
  height: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Дробная часть от синуса — простой и равномерный источник псевдослучайных
 * чисел. Линейные формулы («умножить и взять остаток») дают коррелированные
 * значения: точки выстраивались в диагональную цепочку вместо разброса.
 */
function noise(seed: number): number {
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Шарики: положение в долях панели, радиус и прозрачность. Считаются один раз
 * при загрузке модуля — на отрисовку это не влияет.
 */
const BUBBLES = Array.from({ length: 34 }, (_, i) => {
  const r1 = noise(i + 1);
  const r2 = noise((i + 1) * 1.7 + 11);
  const r3 = noise((i + 1) * 2.3 + 29);
  const r4 = noise((i + 1) * 3.1 + 53);
  return {
    x: r1,
    y: r2,
    r: 2.5 + r3 * 5.5,
    o: 0.26 + r4 * 0.34,
  };
});

export function BlurPanel({ cardColor, accent, height, style }: BlurPanelProps) {
  const [width, setWidth] = useState(0);
  const drift = useRef(new Animated.Value(0)).current;

  // Медленный дрейф шариков. Движение считает система (нативный драйвер),
  // поэтому интерфейс не перерисовывается и не лагает.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [4, -4] });

  // Прозрачный вариант цвета карточки для градиентов мягких краёв.
  const clear = `${cardColor}00`;

  return (
    <View
      style={[{ height, borderRadius: 10, overflow: 'hidden' }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 0.5) setWidth(w);
      }}
    >
      {width > 0 ? (
        <>
          {/* Шарики: слой больше панели, чтобы при дрейфе не оголялись углы. */}
          <View style={styles.layer} pointerEvents="none">
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
                {BUBBLES.map((b, i) => {
                  const cx = OVERSCAN + b.x * width;
                  const cy = OVERSCAN + b.y * height;
                  return (
                    <Circle key={i} cx={cx} cy={cy} r={b.r} opacity={b.o}>
                      {/* Мягкость даёт градиент: края растворяются к нулю. */}
                      <RadialGradient c={vec(cx, cy)} r={b.r} colors={[accent, `${accent}00`]} />
                    </Circle>
                  );
                })}
              </Canvas>
            </Animated.View>
          </View>

          {/* Лёгкая вуаль и мягкие края со всех четырёх сторон. */}
          <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
            {/* Вуаль в тон карточки: размытое пятно остаётся видно, адрес — нет. */}
            <Rect x={0} y={0} width={width} height={height} color={cardColor} opacity={0.34} />

            <Rect x={0} y={0} width={width} height={FADE}>
              <LinearGradient start={vec(0, 0)} end={vec(0, FADE)} colors={[cardColor, clear]} />
            </Rect>
            <Rect x={0} y={height - FADE} width={width} height={FADE}>
              <LinearGradient start={vec(0, 0)} end={vec(0, FADE)} colors={[clear, cardColor]} />
            </Rect>
            <Rect x={0} y={0} width={FADE} height={height}>
              <LinearGradient start={vec(0, 0)} end={vec(FADE, 0)} colors={[cardColor, clear]} />
            </Rect>
            <Rect x={width - FADE} y={0} width={FADE} height={height}>
              <LinearGradient start={vec(0, 0)} end={vec(FADE, 0)} colors={[clear, cardColor]} />
            </Rect>
          </Canvas>
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
});