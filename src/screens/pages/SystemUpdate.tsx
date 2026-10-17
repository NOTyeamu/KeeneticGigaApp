import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PageCard } from '../../components/PageParts';
import { UpdateProgress } from '../../components/UpdateProgress';
import { Row } from '../../components/Row';
import { LoadingState } from '../../components/States';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api } from '../../lib/api';
import { useAlert } from '../../components/AlertDialog';
import { getAppVersion, APP_RELEASES_URL, type UpdateCheckResult } from '../../lib/version';
import { checkUpdate, downloadAndInstall } from '../../lib/updater';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Обновление системы» — компактный экран: состояние приложения крупно и
 * по центру, действие одной кнопкой, а обновление прошивки роутера ниже
 * короткой строкой со ссылкой на веб-интерфейс.
 */
export default function SystemUpdate() {
  const { colors, haptic } = useSettings();
  const alert = useAlert();
  const creds = useCreds();

  // Прошивка роутера: нужна только её версия, поэтому грузим без спешки.
  const router = useApi('system-update', () => Api.system(creds));
  const routerData = router.data as any;

  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<{ p: number | null; written: number; total: number } | null>(null);
  const [installing, setInstalling] = useState(false);

  const current = getAppVersion();
  const hasUpdate = update?.hasUpdate ?? false;
  const busy = progress != null || installing;

  const runCheck = async () => {
    haptic();
    setChecking(true);
    try {
      setUpdate(await checkUpdate());
    } catch (e: any) {
      alert.show({
        title: 'Не удалось проверить',
        message: e?.message ?? 'Проверьте подключение к сети.',
        actions: [{ text: 'OK' }],
      });
    } finally {
      setChecking(false);
    }
  };

  const runInstall = async () => {
    if (!update) return;
    haptic();
    setProgress({ p: 0, written: 0, total: 0 });
    try {
      await downloadAndInstall(update, (p) => setProgress({ p: p.progress, written: p.written, total: p.total }));
      setInstalling(true);
      setProgress(null);
      alert.show({
        title: 'Открыт установщик',
        message: 'Подтвердите установку — Android спросит разрешение.',
        actions: [{ text: 'Понятно' }],
      });
    } catch (e: any) {
      setProgress(null);
      alert.show({
        title: 'Не удалось обновить',
        message: e?.message ?? 'Скачайте обновление со страницы релизов.',
        actions: [{ text: 'OK' }],
      });
    }
  };

  return (
    <View style={{ gap: Spacing.md }}>
      {/* ── Состояние приложения ── */}
      <PageCard title="Приложение">
        <View style={styles.hero}>
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor: hasUpdate ? colors.accentSoft : '#00000000',
                borderColor: hasUpdate ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons
              name={hasUpdate ? 'cloud-download' : 'checkmark-circle'}
              size={26}
              color={hasUpdate ? colors.accent : colors.online}
            />
          </View>
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text, marginTop: 10, textAlign: 'center' }}>
            {hasUpdate ? `Доступна версия ${update?.latest.version}` : update ? 'Последняя версия' : `Версия ${current}`}
          </Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary, marginTop: 3, textAlign: 'center' }}>
            {hasUpdate ? `Установлена ${current}` : update ? `Установлена ${current}` : 'Проверьте наличие новой версии'}
          </Text>
        </View>

        {progress ? (
          <UpdateProgress
            progress={progress.p}
            written={progress.written}
            total={progress.total}
            label="Скачивание обновления"
          />
        ) : (
          <Pressable
            onPress={hasUpdate ? runInstall : runCheck}
            disabled={checking || busy}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: hasUpdate ? colors.accent : colors.accentSoft,
                borderColor: colors.accent,
                opacity: checking ? 0.6 : pressed ? 0.88 : 1,
              },
            ]}
          >
            <Ionicons
              name={hasUpdate ? 'download-outline' : 'refresh-outline'}
              size={17}
              color={hasUpdate ? '#FFFFFF' : colors.accent}
            />
            <Text
              style={{
                fontFamily: FONT.semiBold,
                fontSize: 15,
                color: hasUpdate ? '#FFFFFF' : colors.accent,
                marginLeft: 8,
              }}
            >
              {checking ? 'Проверка…' : hasUpdate ? `Обновить до ${update?.latest.version}` : 'Проверить обновления'}
            </Text>
          </Pressable>
        )}

        {installing && !progress ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
            Установщик открыт — подтвердите установку
          </Text>
        ) : null}

        {hasUpdate && !progress ? (
          <Pressable onPress={runCheck} disabled={busy} hitSlop={8} style={{ marginTop: 10, alignSelf: 'center' }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: colors.textSecondary }}>
              Проверить ещё раз
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => Linking.openURL(APP_RELEASES_URL)}
          hitSlop={8}
          style={{ marginTop: 12, alignSelf: 'center' }}
        >
          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted }}>
            Все версии на GitHub
          </Text>
        </Pressable>
      </PageCard>

      {/* ── Прошивка роутера: коротко и со ссылкой ── */}
      <PageCard title="Прошивка роутера">
        <View style={[styles.note, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={17} color={colors.accent} />
          <Text style={{ flex: 1, marginLeft: 9, fontFamily: FONT.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary }}>
            Прошивка обновляется в веб-интерфейсе роутера. Здесь — только её текущая версия.
          </Text>
        </View>
        <View style={{ marginTop: Spacing.xs }}>
          <Row label="Версия" value={String(routerData?.fw_version ?? routerData?.firmware?.version ?? '—')} />
          <Row label="Сборка" value={String(routerData?.firmware?.build ?? routerData?.build ?? '—')} last />
        </View>
      </PageCard>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});