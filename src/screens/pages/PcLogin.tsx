import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { PageCard } from '../../components/PageParts';
import { QRCode } from '../../components/QRCode';
import { ActionButton } from '../../components/FormParts';
import { useAlert } from '../../components/AlertDialog';
import { useAuth } from '../../context/AuthContext';
import { getBaseUrl } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Вход с компьютера» — перенос данных роутера на ПК через QR-код.
 *
 * Автоматический вход на компьютере возможен только с расширением
 * Tampermonkey: страница роутера открывается по обычному http:// и её
 * собственный код мы менять не можем, а сторонний сайт не имеет права
 * обращаться к роутеру напрямую. Скрипт для Tampermonkey работает внутри
 * страницы роутера и выполняет вход сам.
 *
 * Без расширения остаётся запасной путь: страница связки открывает роутер и
 * кладёт пароль в буфер обмена — остаётся вставить его в поле пароля.
 */

/** Страница связки: HTTPS обязателен — иначе браузер не даст доступ к камере. */
const PAIR_PAGE_URL = 'https://notyeamu.github.io/KeeneticGigaApp/pair.html';
const SCRIPT_URL = 'https://notyeamu.github.io/KeeneticGigaApp/keenetic-pair.user.js';

export default function PcLogin() {
  const { colors, haptic } = useSettings();
  const { credentials } = useAuth();
  const alert = useAlert();
  const [showPassword, setShowPassword] = useState(false);

  // В QR кладём адрес роутера и данные входа. Значение закодировано целиком,
  // поэтому меняется вместе с адресом: перекодирование происходит само.
  const qrValue = useMemo(() => {
    const payload = {
      url: getBaseUrl(),
      login: credentials?.user ?? '',
      password: credentials?.pass ?? '',
    };
    return JSON.stringify(payload);
  }, [credentials]);

  const copyPassword = async () => {
    haptic();
    if (!credentials?.pass) return;
    await Clipboard.setStringAsync(credentials.pass);
    alert.show({ title: 'Пароль скопирован', message: 'Вставьте его в поле пароля на странице роутера.', actions: [{ text: 'OK' }] });
  };

  const openPairPage = () => {
    haptic();
    Linking.openURL(PAIR_PAGE_URL);
  };

  const installScript = () => {
    haptic();
    alert.show({
      title: 'Скрипт для Tampermonkey',
      message:
        'Откроется файл скрипта — Tampermonkey предложит его установить. После установки вход с компьютера будет выполняться автоматически.',
      actions: [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть', onPress: () => Linking.openURL(SCRIPT_URL) },
      ],
    });
  };

  const showHelp = () => {
    haptic();
    alert.show({
      title: 'Как это работает',
      message:
        '1. На компьютере откройте страницу связки и включите камеру.\n' +
        '2. Наведите камеру на этот QR-код.\n' +
        '3. Откроется страница роутера и войдёт автоматически.\n\n' +
        'Для автоматического входа на компьютере нужно расширение Tampermonkey и скрипт из этого экрана: ' +
        'страница роутера открывается по незащищённому http, и её собственный код войти за вас не может.\n\n' +
        'Без скрипта страница связки откроет роутер и положит пароль в буфер обмена — останется вставить его вручную.\n\n' +
        'Пароль передаётся только между телефоном и вашим компьютером: никуда в интернет он не отправляется.',
      actions: [{ text: 'Понятно' }],
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

      {/* ── QR-код ── */}
      <PageCard title="Отсканируйте на компьютере">
        <View style={styles.qrWrap}>
          <QRCode value={qrValue} size={264} color="#0A0F14" background="#FFFFFF" />
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          На компьютере откройте страницу связки и наведите камеру на этот код — роутер откроется и вход выполнится сам.
        </Text>

        <ActionButton
          label="Открыть страницу связки"
          icon="open-outline"
          variant="accent"
          onPress={openPairPage}
          style={{ marginTop: Spacing.sm }}
        />

        <Text style={[styles.subHint, { color: colors.textMuted }]}>
          Страница откроется на компьютере: {PAIR_PAGE_URL.replace('https://', '')}
        </Text>
      </PageCard>

      {/* ── Данные, которые попадут на компьютер ── */}
      <PageCard title="Данные для входа">
        <Row label="Адрес роутера" value={getBaseUrl()} />
        <Row label="Логин" value={credentials?.user ?? '—'} />
        <Row
          label="Пароль"
          value={credentials?.pass ? (showPassword ? credentials.pass : '•'.repeat(Math.min(12, credentials.pass.length))) : '—'}
          onPress={() => {
            haptic();
            setShowPassword((v) => !v);
          }}
          actionIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
        />
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
          <ActionButton label="Скопировать пароль" icon="copy-outline" onPress={copyPassword} style={{ flex: 1 }} />
        </View>
      </PageCard>

      {/* ── Автоматический вход ── */}
      <PageCard title="Автоматический вход">
        <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            Чтобы вход выполнялся сам, на компьютере нужно расширение Tampermonkey и скрипт. Без него страница
            связки откроет роутер и положит пароль в буфер обмена.
          </Text>
        </View>
        <ActionButton
          label="Установить скрипт"
          icon="download-outline"
          onPress={installScript}
          style={{ marginTop: Spacing.sm }}
        />
        <Text style={[styles.subHint, { color: colors.textMuted }]}>
          Файл: {SCRIPT_URL.replace('https://', '')}
        </Text>
      </PageCard>

      <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 17 }}>
        Данные передаются только между телефоном и вашим компьютером.{'\n'}В интернет ничего не отправляется —
        страница связки работает целиком в браузере.
      </Text>
    </View>
  );
}

/** Строка «подпись — значение» с необязательным действием справа. */
function Row({
  label,
  value,
  onPress,
  actionIcon,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  actionIcon?: string;
}) {
  const { colors } = useSettings();
  const content = (
    <View style={styles.row}>
      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary }}>{label}</Text>
      <View style={styles.rowValue}>
        <Text
          style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.text }}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
        {actionIcon ? <Ionicons name={actionIcon as any} size={15} color={colors.textMuted} /> : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.accentSoft }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrWrap: {
    alignSelf: 'center',
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  subHint: {
    fontFamily: FONT.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: Spacing.sm,
  },
});