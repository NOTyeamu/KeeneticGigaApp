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
 * Внутри медленно плавают синие точки. Они мягкие за счёт радиального
 * градиента, а не фильтра размытия: этот приём уже работает в приложении —
 * на нём сделано свечение нижней панели вкладок.
 *
 * Размер точек зависит от расстояния до центра: у краёв мелкие, к середине
 * крупные. При раскрытии точки разлетаются из центра и гаснут.
 *
 * Используются только проверенные средства Skia: Canvas, Circle,
 * RadialGradient, Rect, LinearGradient, vec.
 */

/** Мягкость края панели в пикселях. */
const FADE = 12;
/** Запас по краям для дрейфа точек, чтобы панель не «худела». */
const OVERSCAN = 20;

interface BlurPanelProps {
  /** Цвет карточки, в которую вписана панель: в него растворяются края. */
  cardColor: string;
  accent: string;
  height: number;
  /**
   * 0 — значение скрыто, 1 — раскрыто. По этому значению точки улетают из
   * центра и гаснут.
   */
  reveal: Animated.Value;
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
 * Точки: положение в долях панели, радиус и прозрачность. Радиус считается от
 * близости к центру, поэтому у краёв точки мелкие, а в середине крупные.
 * Значения считаются один раз при загрузке модуля — на отрисовку не влияют.
 */
const DOTS = Array.from({ length: 46 }, (_, i) => {
  const x = noise(i + 1);
  const y = noise((i + 1) * 1.7 + 11);
  const size = noise((i + 1) * 2.3 + 29);
  const alpha = noise((i + 1) * 3.1 + 53);

  // Расстояние от центра: 0 — центр, 1 — край.
  const dx = (x - 0.5) * 2;
  const dy = (y - 0.5) * 2;
  const dist = Math.min(1, Math.hypot(dx, dy) / 1.15);

  return {
    x,
    y,
    // Мелкие у края (2), крупные к центру (до 9).
    r: 2 + (1 - dist) ** 1.6 * 7 + size * 1.5,
    o: 0.24 + alpha * 0.3,
    // Насколько далеко точка улетает при раскрытии: дальние — сильнее.
    fly: 1 + dist * 0.6,
  };
});

export function BlurPanel({ cardColor, accent, height, reveal, style }: BlurPanelProps) {
  const [width, setWidth] = useState(0);
  const drift = useRef(new Animated.Value(0)).current;

  // Медленный дрейф точек. Движение считает система (нативный драйвер),
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

  /**
   * Разлёт из центра: слой точек растёт и гаснет. Растяжение от центральной
   * точки даёт ровно то ощущение, что точки улетают во все стороны.
   */
  const flyScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const flyOpacity = reveal.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.25, 0] });

  // Вуаль и мягкие края гаснут вместе с точками.
  const veilOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

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
          {/* Точки: слой больше панели, чтобы при дрейфе не оголялись углы. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.layer,
              {
                transform: [{ scale: flyScale }],
                opacity: flyOpacity,
              },
            ]}
          >
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
                {DOTS.map((d, i) => {
                  const cx = OVERSCAN + d.x * width;
                  const cy = OVERSCAN + d.y * height;
                  return (
                    <Circle key={i} cx={cx} cy={cy} r={d.r} opacity={d.o}>
                      {/* Мягкость даёт градиент: края растворяются к нулю. */}
                      <RadialGradient c={vec(cx, cy)} r={d.r} colors={[accent, `${accent}00`]} />
                    </Circle>
                  );
                })}
              </Canvas>
            </Animated.View>
          </Animated.View>

          {/* Лёгкая вуаль и мягкие края со всех четырёх сторон. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: veilOpacity }]}>
            <Canvas style={{ width, height }}>
              {/* Вуаль в тон карточки: пятно остаётся видно, значение — нет. */}
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
          </Animated.View>
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