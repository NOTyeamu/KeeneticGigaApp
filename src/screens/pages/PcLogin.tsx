import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { PageCard } from '../../components/PageParts';
import { ActionButton } from '../../components/FormParts';
import { useAlert } from '../../components/AlertDialog';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { getBaseUrl } from '../../lib/api';
import { parseTicket, sendToComputer, type PairTicket } from '../../lib/pairing';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Вход с компьютера» — перенос данных роутера на ПК.
 *
 * Порядок обратный тому, что кажется очевидным: QR-код показывает компьютер,
 * а телефон его считывает. Так вышло не случайно. Страница роутера
 * открывается по обычному http:// и потому не является защищённым
 * контекстом: браузер не даёт ей доступ к камере, снять код на компьютере
 * физически нечем. Камера есть только у телефона, поэтому код показывает
 * компьютер, а читает телефон.
 *
 * Данные роутера при этом движутся в обратную сторону: телефон шифрует их
 * ключом из считанного кода и отправляет через очередь ntfy.sh, где их
 * забирает страница на компьютере. Ключ есть только у двух этих экранов,
 * поэтому посредник видит лишь нечитаемый набор байт.
 *
 * Сам вход на компьютере выполняет скрипт для Tampermonkey: он работает
 * внутри страницы роутера, то есть в её собственном источнике, и поэтому
 * может обратиться к ней с нужными данными.
 */

/** Страница связки. Открывается на компьютере, не на телефоне. */
const PAIR_PAGE_URL = 'https://notyeamu.github.io/KeeneticGigaApp/pair.html';
const SCRIPT_URL = 'https://notyeamu.github.io/KeeneticGigaApp/keenetic-pair.user.js';

type Stage = 'idle' | 'scanning' | 'sending' | 'sent' | 'failed';

export default function PcLogin() {
  const { colors, haptic } = useSettings();
  const { credentials } = useAuth();
  const alert = useAlert();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Билет последнего считанного кода — нужен для повторной отправки. */
  const [ticket, setTicket] = useState<PairTicket | null>(null);

  /**
   * Камера вызывает обработчик много раз в секунду, пока код в кадре.
   * Замок не даёт отправить данные дважды и уводит из состояния гонки,
   * когда отправка ещё идёт, а кадр уже пришёл снова.
   */
  const busy = useRef(false);

  const send = useCallback(
    async (found: PairTicket) => {
      if (!credentials) {
        setError('Нет данных для входа в роутер.');
        setStage('failed');
        return;
      }
      setStage('sending');
      setError(null);
      try {
        await sendToComputer(found, {
          url: getBaseUrl(),
          login: credentials.user,
          password: credentials.pass,
        });
        haptic(30);
        setStage('sent');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Не удалось передать данные.');
        setStage('failed');
      }
    },
    [credentials, haptic],
  );

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (busy.current) return;
      const found = parseTicket(result.data);
      // Чужой QR просто игнорируем: мимо кадр может пролетать что угодно,
      // и ругаться на каждый посторонний код раздражало бы больше, чем помогало.
      if (!found) return;

      busy.current = true;
      haptic(20);
      setTicket(found);
      void send(found).finally(() => {
        busy.current = false;
      });
    },
    [haptic, send],
  );

  const startScan = async () => {
    haptic();
    setError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setError('Без доступа к камере считать код не получится. Разрешите камеру в настройках телефона.');
        setStage('failed');
        return;
      }
    }
    setStage('scanning');
  };

  const retry = () => {
    haptic();
    if (ticket) void send(ticket);
  };

  /** Адрес страницы копируем, а не открываем: она нужна на компьютере. */
  const copyPairLink = async () => {
    haptic();
    await Clipboard.setStringAsync(PAIR_PAGE_URL);
    alert.show({
      title: 'Адрес скопирован',
      message: 'Откройте эту ссылку в браузере на компьютере — там появится QR-код.',
      actions: [{ text: 'OK' }],
    });
  };

  const showHelp = () => {
    haptic();
    alert.show({
      title: 'Как это работает',
      message:
        '1. На компьютере откройте страницу связки — появится QR-код.\n' +
        '2. Здесь нажмите «Сканировать код» и наведите камеру на код с экрана компьютера.\n' +
        '3. Данные уйдут на компьютер, и роутер там войдёт сам.\n\n' +
        'Код показывает компьютер, а не телефон: страница роутера открывается по http и браузер не даёт ей доступ к камере.\n\n' +
        'Данные зашифрованы ключом из самого QR-кода. Ключ есть только у этих двух экранов, поэтому посредник видит лишь нечитаемый набор байт, и тот не сохраняется. Вход на компьютере выполняет скрипт для Tampermonkey — он единственный работает внутри страницы роутера и может войти за вас.',
      actions: [{ text: 'Понятно' }],
    });
  };

  const showScriptHelp = () => {
    haptic();
    alert.show({
      title: 'Скрипт для Tampermonkey',
      message:
        'Автоматический вход на компьютере возможен только со скриптом для Tampermonkey: страница роутера открывается по незащищённому http, и её собственный код войти за вас не может.\n\n' +
        'Откроется файл скрипта — Tampermonkey предложит его установить. После установки вход будет выполняться сам.',
      actions: [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть', onPress: () => void Linking.openURL(SCRIPT_URL) },
      ],
    });
  };

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.headerRow}>
        <Text style={{ flex: 1, fontFamily: FONT.bold, fontSize: 20, color: colors.text }}>
          Вход с компьютера
        </Text>
        <Pressable onPress={showHelp} hitSlop={10} style={{ padding: 2 }}>
          <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
        </Pressable>
      </View>

      {/* ── Шаг 1: страница на компьютере ── */}
      <PageCard title="Шаг 1. Откройте страницу на компьютере">
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          На компьютере откройте страницу связки — она покажет QR-код.
        </Text>
        <ActionButton
          label="Скопировать адрес страницы"
          icon="copy-outline"
          variant="accent"
          onPress={copyPairLink}
          style={{ marginTop: Spacing.sm }}
        />
        <Text style={[styles.link, { color: colors.textMuted }]} selectable>
          {PAIR_PAGE_URL}
        </Text>
        <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            Открывать её нужно именно на компьютере: данные передаются между двумя устройствами, и если открыть
            страницу на телефоне, передавать будет некому.
          </Text>
        </View>
      </PageCard>

      {/* ── Шаг 2: сканирование ── */}
      <PageCard title="Шаг 2. Считайте код с компьютера">
        {stage === 'scanning' ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              active
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
            {/* Рамка наведения: сама камера ничего не рисует. */}
            <View style={styles.reticle} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Pressable
              onPress={() => {
                haptic();
                setStage('idle');
              }}
              style={styles.stopBtn}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Наведите камеру телефона на код в окне на компьютере. Считывание идёт автоматически.
            </Text>
            <ActionButton
              label={stage === 'sending' ? 'Передаём данные…' : 'Сканировать код'}
              icon="qr-code-outline"
              variant="accent"
              disabled={stage === 'sending'}
              onPress={startScan}
            />
          </View>
        )}

        {stage === 'sending' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>Передаём данные на компьютер…</Text>
          </View>
        ) : null}
      </PageCard>

      {/* ── Результат передачи ── */}
      {stage === 'sent' ? (
        <PageCard title="Данные переданы">
          <View style={[styles.note, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={[styles.noteText, { color: colors.text }]}>
              Отправлено. На компьютере окно роутера откроется и вход выполнится сам — если там установлен скрипт
              для Tampermonkey. Без него страница откроется, но пароль придётся ввести вручную.
            </Text>
          </View>
          <ActionButton
            label="Отправить ещё раз"
            icon="refresh-outline"
            onPress={retry}
            style={{ marginTop: Spacing.sm }}
          />
        </PageCard>
      ) : null}

      {stage === 'failed' && error ? (
        <PageCard title="Не удалось передать">
          <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.danger }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[styles.noteText, { color: colors.text }]}>{error}</Text>
          </View>
          {ticket ? (
            <ActionButton
              label="Повторить"
              icon="refresh-outline"
              onPress={retry}
              style={{ marginTop: Spacing.sm }}
            />
          ) : (
            <ActionButton
              label="Сканировать снова"
              icon="qr-code-outline"
              onPress={startScan}
              style={{ marginTop: Spacing.sm }}
            />
          )}
        </PageCard>
      ) : null}

      {/* ── Данные, которые уйдут на компьютер ── */}
      <PageCard title="Данные для входа">
        <Row label="Адрес роутера" value={getBaseUrl()} />
        <Row label="Пароль" value={credentials?.pass ? '••••••••' : '—'} />
      </PageCard>

      {/* ── Автоматический вход ── */}
      <PageCard title="Автоматический вход">
        <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            Чтобы вход на компьютере выполнялся сам, там нужно расширение Tampermonkey и скрипт.
          </Text>
        </View>
        <ActionButton
          label="Установить скрипт"
          icon="download-outline"
          onPress={showScriptHelp}
          style={{ marginTop: Spacing.sm }}
        />
      </PageCard>

      <Text style={[styles.footer, { color: colors.textMuted }]}>
        Данные зашифрованы ключом из QR-кода. Ключ есть только у телефона и компьютера,{'\n'}
        а само сообщение на сервере не сохраняется.
      </Text>
    </View>
  );
}

/** Строка «подпись — значение». */
function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useSettings();
  return (
    <View style={styles.row}>
      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary }}>{label}</Text>
      <Text
        style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.text, flexShrink: 1, marginLeft: Spacing.sm }}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  noteText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  link: {
    fontFamily: FONT.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  cameraWrap: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    height: 300,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  reticle: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#FFFFFF',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  stopBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
  },
  statusText: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  footer: {
    fontFamily: FONT.regular,
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 17,
  },
});