import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row } from '../../components/Row';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { UpdateProgress } from '../../components/UpdateProgress';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api, toArray } from '../../lib/api';
import { getAppVersion, APP_RELEASES_URL, type UpdateCheckResult } from '../../lib/version';
import { checkUpdate, downloadAndInstall } from '../../lib/updater';
import { useSettings } from '../../context/SettingsContext';
import { useAlert } from '../../components/AlertDialog';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Обновление системы» — прошивка роутера и обновление самого приложения.
 *
 * Приложение умеет обновлять себя: проверяет релизы в репозитории, скачивает
 * APK с показом прогресса и передаёт его системному установщику. Android
 * спросит подтверждение — это его защита, обойти её нельзя.
 */
export default function SystemUpdate() {
  const creds = useCreds();
  const { colors, haptic } = useSettings();
  const alert = useAlert();
  const { data, loading, error, refetch } = useApi('system-update', () => Api.system(creds));

  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<{ p: number | null; written: number; total: number } | null>(null);
  const [installing, setInstalling] = useState(false);

  const current = getAppVersion();

  const runCheck = async () => {
    haptic();
    setChecking(true);
    try {
      const result = await checkUpdate();
      setUpdate(result);
      if (!result.hasUpdate) {
        alert.show({
          title: 'Обновлений нет',
          message: `Установлена последняя версия — ${result.current}.`,
          actions: [{ text: 'OK' }],
        });
      }
    } catch (e: any) {
      alert.show({
        title: 'Проверка обновлений',
        message: e?.message ?? 'Не удалось проверить обновления. Попробуйте позже.',
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
        title: 'Загрузка завершена',
        message: 'Открыт системный установщик. Подтвердите установку — Android спросит разрешение.',
        actions: [{ text: 'Понятно' }],
      });
    } catch (e: any) {
      setProgress(null);
      alert.show({
        title: 'Не удалось обновить',
        message: e?.message ?? 'Попробуйте скачать обновление со страницы релизов.',
        actions: [{ text: 'OK' }],
      });
    }
  };

  const busy = progress != null || installing;

  return (
    <View style={{ gap: Spacing.md }}>
      {/* ── Обновление приложения ── */}
      <PageCard title="Обновление приложения">
        <Row label="Установленная версия" value={current} />
        <Row label="Последняя версия" value={update ? update.latest.version : '—'} last />

        {update?.hasUpdate ? (
          <View style={[styles.banner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Ionicons name="arrow-up-circle" size={20} color={colors.accent} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontFamily: FONT.semiBold, fontSize: 14, color: colors.accent }}>
                Доступна версия {update.latest.version}
              </Text>
              {update.latest.notes ? (
                <Text
                  style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.accent, marginTop: 3 }}
                  numberOfLines={4}
                >
                  {update.latest.notes.split('\n').filter((l) => l.trim().startsWith('-')).slice(0, 4).join('\n')}
                </Text>
              ) : null}
              {update.latest.assetName ? (
                <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.accent, marginTop: 4 }}>
                  {update.latest.assetName}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {progress ? (
          <View style={{ marginTop: Spacing.sm }}>
            <UpdateProgress
              progress={progress.p}
              written={progress.written}
              total={progress.total}
              label="Скачивание обновления"
            />
          </View>
        ) : null}

        {update?.hasUpdate ? (
          <Pressable
            onPress={runInstall}
            disabled={busy}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [
              styles.btn,
              styles.btnAccent,
              { backgroundColor: colors.accent, opacity: busy ? 0.6 : pressed ? 0.88 : 1 },
            ]}
          >
            <Ionicons name="download-outline" size={18} color="#FFFFFF" />
            <Text style={styles.btnAccentText}>
              {installing ? 'Установщик открыт' : `Обновить до ${update.latest.version}`}
            </Text>
          </Pressable>
        ) : null}

        {update?.hasUpdate && update.latest.assetUrl ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
            Файл загрузится в приложение, затем откроется установщик Android
          </Text>
        ) : null}

        <Pressable
          onPress={runCheck}
          disabled={checking || busy}
          android_ripple={{ color: colors.accentSoft }}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.accentSoft, borderColor: colors.accent, opacity: checking ? 0.6 : pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons
            name={update?.hasUpdate ? 'refresh-outline' : 'cloud-download-outline'}
            size={18}
            color={colors.accent}
          />
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: colors.accent, marginLeft: 10 }}>
            {checking ? 'Проверка…' : 'Проверить обновления'}
          </Text>
        </Pressable>

        {update && !update.hasUpdate ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.online} />
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.online }}>
              Установлена последняя версия
            </Text>
          </View>
        ) : null}

        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
          Страница релизов: {APP_RELEASES_URL.replace('https://', '')}
        </Text>
      </PageCard>

      {/* ── Прошивка роутера ── */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data ? (
        <EmptyState title="Нет данных" subtitle="Сведения о прошивке недоступны." />
      ) : (
        <>
          <PageCard title="Прошивка роутера">
            <Row label="Версия" value={String(data.fw_version ?? data.firmware?.version ?? '—')} />
            <Row label="Сборка" value={String(data.firmware?.build ?? data.build ?? '—')} />
            {data.firmware?.release || data.firmware?.date ? (
              <Row label="Дата выпуска" value={String(data.firmware.release || data.firmware.date)} />
            ) : null}
            <Row label="Платформа" value={String(data.platform ?? data.device ?? '—')} last />
          </PageCard>

          {toArray(data.components || data.firmware?.components).length > 0 ? (
            <PageCard title={`Компоненты (${toArray(data.components || data.firmware?.components).length})`}>
              {toArray(data.components || data.firmware?.components).map((c: any, i: number, arr: any[]) => (
                <Row
                  key={i}
                  label={String(c.name || c.title || c.id || `#${i + 1}`)}
                  value={String(c.version || c['fw_version'] || '—')}
                  last={i === arr.length - 1}
                />
              ))}
            </PageCard>
          ) : null}

          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>
            Установка обновлений прошивки доступна в веб-интерфейсе роутера.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  btnAccent: {
    borderWidth: 0,
  },
  btnAccentText: {
    fontFamily: FONT.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginLeft: 10,
  },
});