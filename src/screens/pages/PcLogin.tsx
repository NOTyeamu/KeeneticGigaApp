import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageCard } from '../../components/PageParts';
import { ActionButton, LabeledInput } from '../../components/FormParts';
import { useAlert } from '../../components/AlertDialog';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { getBaseUrl } from '../../lib/api';
import { parseTicket, sendToComputer, type PairTicket } from '../../lib/pairing';
import { downloadScript, SCRIPT_LINK, SCRIPT_FILE_NAME } from '../../lib/script';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Сканировать QR» — перенос данных роутера на компьютер.
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
 * Вход на компьютере выполняет скрипт для Tampermonkey: он работает внутри
 * страницы роутера, то есть в её собственном источнике, и поэтому может
 * обратиться к ней с нужными данными.
 */

/** Страница связки. Открывается на компьютере, не на телефоне. */
const PAIR_PAGE_URL = 'https://notyeamu.github.io/KeeneticGigaApp/pair.html';

type Stage = 'idle' | 'sending' | 'sent' | 'failed';

export default function PcLogin() {
  const { colors, haptic } = useSettings();
  const { credentials } = useAuth();
  const alert = useAlert();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Билет последнего считанного кода — нужен для повторной отправки. */
  const [ticket, setTicket] = useState<PairTicket | null>(null);

  /** Окно камеры поверх экрана: страница остаётся на месте и не «прыгает». */
  const [scanning, setScanning] = useState(false);
  /** Свои данные для входа — если нужно отправить не те, что сохранены. */
  const [custom, setCustom] = useState<{ user: string; pass: string } | null>(null);
  const [savingScript, setSavingScript] = useState(false);

  const login = custom?.user ?? credentials?.user ?? '';
  const password = custom?.pass ?? credentials?.pass ?? '';

  /**
   * Камера вызывает обработчик много раз в секунду, пока код в кадре.
   * Замок не даёт отправить данные дважды и уводит из состояния гонки,
   * когда отправка ещё идёт, а кадр уже пришёл снова.
   */
  const busy = useRef(false);

  const send = useCallback(
    async (found: PairTicket) => {
      if (!password) {
        setError('Нет пароля для входа в роутер.');
        setStage('failed');
        return;
      }
      setStage('sending');
      setError(null);
      try {
        await sendToComputer(found, { url: getBaseUrl(), login, password });
        haptic(30);
        setStage('sent');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Не удалось передать данные.');
        setStage('failed');
      }
    },
    [login, password, haptic],
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
      setScanning(false);
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
    setScanning(true);
  };

  /** Скачивает скрипт файлом: ссылку из приложения браузер не перехватит. */
  const saveScript = async () => {
    haptic();
    setSavingScript(true);
    try {
      await downloadScript();
      alert.show({
        title: 'Скрипт сохранён',
        message:
          'Файл лежит там, куда вы его сохранили. Откройте его — Tampermonkey предложит установку.\n\n' +
          'На компьютере тот же файл можно взять по ссылке:\n' + SCRIPT_LINK,
        actions: [{ text: 'OK' }],
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить скрипт.';
      // Отмена выбора папки — не ошибка, о ней достаточно молчания.
      if (!/отменено/i.test(message)) {
        alert.show({ title: 'Не удалось сохранить', message, actions: [{ text: 'OK' }] });
      }
    } finally {
      setSavingScript(false);
    }
  };

  const copyScriptLink = async () => {
    haptic();
    await Clipboard.setStringAsync(SCRIPT_LINK);
    alert.show({
      title: 'Ссылка скопирована',
      message: 'Вставьте её в браузер на компьютере — Tampermonkey предложит установить скрипт.',
      actions: [{ text: 'OK' }],
    });
  };

  const copyPairLink = async () => {
    haptic();
    await Clipboard.setStringAsync(PAIR_PAGE_URL);
    alert.show({
      title: 'Адрес скопирован',
      message: 'Откройте эту ссылку в браузере на компьютере — там появится QR-код.',
      actions: [{ text: 'OK' }],
    });
  };

  const editCredentials = () => {
    haptic();
    setCustom({ user: login, pass: password });
  };

  const resetCredentials = () => {
    haptic();
    setCustom(null);
  };

  const showHelp = () => {
    haptic();
    alert.show({
      title: 'Как это работает',
      message:
        '1. На компьютере откройте страницу связки — появится QR-код.\n' +
        '2. Здесь нажмите «Сканировать QR» и наведите камеру на код с экрана компьютера.\n' +
        '3. Данные уйдут на компьютер, и роутер там войдёт сам.\n\n' +
        'Код показывает компьютер, а не телефон: страница роутера открывается по http, и браузер не даёт ей доступ к камере.\n\n' +
        'Данные зашифрованы ключом из самого QR-кода. Ключ есть только у этих двух экранов, поэтому посредник видит лишь нечитаемый набор байт, и тот не сохраняется.\n\n' +
        'Вход на компьютере выполняет скрипт для Tampermonkey — только он работает внутри страницы роутера и может войти за вас.',
      actions: [{ text: 'Понятно' }],
    });
  };

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.headerRow}>
        <Text style={{ flex: 1, fontFamily: FONT.bold, fontSize: 20, color: colors.text }}>
          Сканировать QR
        </Text>
        <Pressable onPress={showHelp} hitSlop={10} style={{ padding: 2 }}>
          <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
        </Pressable>
      </View>

      {/* ── Основное действие ── */}
      <PageCard>
        <ActionButton
          label={stage === 'sending' ? 'Передаём данные…' : 'Сканировать QR'}
          icon="qr-code-outline"
          variant="accent"
          disabled={stage === 'sending'}
          onPress={startScan}
        />

        {stage === 'sending' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>Передаём данные на компьютер…</Text>
          </View>
        ) : null}

        {stage === 'sent' ? (
          <View style={[styles.note, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={[styles.noteText, { color: colors.text }]}>
              Отправлено. На компьютере окно роутера войдёт само, если там установлен скрипт.
            </Text>
          </View>
        ) : null}

        {stage === 'failed' && error ? (
          <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.danger }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[styles.noteText, { color: colors.text }]}>{error}</Text>
          </View>
        ) : null}

        {stage === 'sent' && ticket ? (
          <ActionButton
            label="Отправить ещё раз"
            icon="refresh-outline"
            onPress={() => ticket && void send(ticket)}
            style={{ marginTop: Spacing.sm }}
          />
        ) : null}
      </PageCard>

      {/* ── Что нужно сделать на компьютере ── */}
      <PageCard title="На компьютере">
        <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.border, marginTop: 0 }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            Откройте страницу связки на компьютере — она покажет QR-код. На телефоне её открывать не нужно:
            передавать будет некому.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
          <ActionButton label="Копировать адрес" icon="copy-outline" onPress={copyPairLink} style={{ flex: 1 }} />
        </View>
        <Text style={[styles.link, { color: colors.textMuted }]} selectable numberOfLines={1}>
          {PAIR_PAGE_URL.replace('https://', '')}
        </Text>
      </PageCard>

      {/* ── Данные для входа ── */}
      <PageCard
        title="Данные для входа"
        action={
          custom ? (
            <Pressable onPress={resetCredentials} hitSlop={8}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 12.5, color: colors.textSecondary }}>Сбросить</Text>
            </Pressable>
          ) : (
            <Pressable onPress={editCredentials} hitSlop={8}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 12.5, color: colors.accent }}>Изменить</Text>
            </Pressable>
          )
        }
      >
        {custom ? (
          <>
            <LabeledInput label="Логин" value={custom.user} onChangeText={(v) => setCustom({ ...custom, user: v })} />
            <LabeledInput
              label="Пароль"
              value={custom.pass}
              onChangeText={(v) => setCustom({ ...custom, pass: v })}
              secureTextEntry
            />
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Эти данные отправятся на компьютер вместо сохранённых.
            </Text>
          </>
        ) : (
          <>
            <Row label="Адрес роутера" value={getBaseUrl()} />
            <Row label="Пароль" value={password ? '••••••••' : '—'} />
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Нажмите «Изменить», чтобы отправить другие данные.
            </Text>
          </>
        )}
      </PageCard>

      {/* ── Скрипт ── */}
      <PageCard title="Скрипт для Tampermonkey">
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Без него страница роутера откроется, но данные в неё не передадутся.
        </Text>
        <ActionButton
          label={savingScript ? 'Сохраняем…' : 'Скачать скрипт'}
          icon="download-outline"
          variant="accent"
          disabled={savingScript}
          onPress={saveScript}
          style={{ marginTop: Spacing.sm }}
        />
        <ActionButton
          label="Скопировать ссылку на скрипт"
          icon="link-outline"
          onPress={copyScriptLink}
          style={{ marginTop: Spacing.sm }}
        />
        <Text style={[styles.link, { color: colors.textMuted }]} selectable numberOfLines={1}>
          {SCRIPT_FILE_NAME}
        </Text>
      </PageCard>

      <Text style={[styles.footer, { color: colors.textMuted }]}>
        Данные зашифрованы ключом из QR-кода. Ключ есть только у телефона и компьютера,{'\n'}
        а само сообщение на сервере не сохраняется.
      </Text>

      {/* ── Окно камеры поверх экрана ── */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)} statusBarTranslucent>
        <View style={[styles.scanScreen, { backgroundColor: '#000000', paddingTop: insets.top }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            active={scanning}
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
              setScanning(false);
            }}
            hitSlop={12}
            style={[styles.closeBtn, { top: insets.top + 12 }]}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>

          <Text style={[styles.scanHint, { paddingBottom: insets.bottom + 40 }]}>
            Наведите камеру на QR-код в окне на компьютере
          </Text>
        </View>
      </Modal>
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
  hint: {
    fontFamily: FONT.regular,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
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
    paddingVertical: 9,
  },
  scanScreen: {
    flex: 1,
    justifyContent: 'center',
  },
  reticle: {
    position: 'absolute',
    top: '28%',
    left: '12%',
    right: '12%',
    aspectRatio: 1,
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FFFFFF',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    fontFamily: FONT.medium,
    fontSize: 13,
    color: '#FFFFFF',
  },
  footer: {
    fontFamily: FONT.regular,
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 17,
  },
});