import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect } from '@shopify/react-native-skia';
// Чистый JS без нативных зависимостей: строит матрицу QR-кода.
import qrcode from 'qrcode-generator';

/**
 * QR-код, нарисованный на холсте Skia.
 *
 * Библиотека отдаёт матрицу «тёмный/светлый», а рисуем мы её сами — тем же
 * Skia, что уже используется в проекте. Так не приходится добавлять новую
 * нативную зависимость ради одного экрана.
 */

interface QRCodeProps {
  /** Данные для кодирования. */
  value: string;
  /** Сторона кода в пикселях. */
  size?: number;
  /** Цвет тёмных модулей. */
  color: string;
  /** Цвет фона. */
  background: string;
  /** Отступ вокруг кода: без него сканеры часто не находят код. */
  quietZone?: number;
}

export function QRCode({
  value,
  size = 220,
  color,
  background,
  quietZone = 12,
}: QRCodeProps) {
  const matrix = useMemo(() => {
    try {
      // 0 — подобрать версию автоматически, 'M' — средний уровень коррекции.
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();

      const count = qr.getModuleCount();
      const cells: { x: number; y: number }[] = [];
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (qr.isDark(row, col)) cells.push({ x: col, y: row });
        }
      }
      return { count, cells };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return <View style={{ width: size, height: size, backgroundColor: background, borderRadius: 12 }} />;
  }

  const inner = size - quietZone * 2;
  const cell = inner / matrix.count;

  return (
    <View style={{ width: size, height: size, backgroundColor: background, borderRadius: 12, padding: quietZone }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {matrix.cells.map((c, i) => (
          <Rect
            key={i}
            x={quietZone + c.x * cell}
            y={quietZone + c.y * cell}
            // На полпикселя больше — иначе между модулями остаются светлые щели.
            width={cell + 0.5}
            height={cell + 0.5}
            color={color}
          />
        ))}
      </Canvas>
    </View>
  );
}