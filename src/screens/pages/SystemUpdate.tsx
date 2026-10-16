import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row } from '../../components/Row';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api, toArray } from '../../lib/api';
import { checkForAppUpdate, getAppVersion, APP_RELEASES_URL, type UpdateCheckResult } from '../../lib/version';
import { useSettings } from '../../context/SettingsContext';
import { useAlert } from '../../components/AlertDialog';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Обновление системы» — прошивка роутера плюс проверка обновлений самого
 * приложения через GitHub Releases. Репозиторий публичный, поэтому релизы
 * читаются обычным запросом без токена: секретов в сборке нет.
 */
export default function SystemUpdate() {
  const creds = useCreds();
  const { colors, haptic } = useSettings();
  const alert = useAlert();
  const { data, loading, error, refetch } = useApi('system-update', () => Api.system(creds));
  const [checking, setChecking] = useState(false);
  const [appUpdate, setAppUpdate] = useState<UpdateCheckResult | null>(null);

  const checkUpdate = async () => {
    haptic();
    setChecking(true);
    try {
      const result = await checkForAppUpdate();
      setAppUpdate(result);
      if (result.hasUpdate) {
        alert.show({
          title: 'Доступно обновление',
          message: `Установлена версия ${result.current}, в репозитории — ${result.latest.version}.`,
          actions: [
            { text: 'Позже', style: 'cancel' },
            { text: 'Открыть', onPress: () => Linking.openURL(result.latest.assetUrl ?? result.latest.url) },
          ],
        });
      } else {
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

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={[styles.note, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
        <Text style={{ flex: 1, marginLeft: 10, fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: colors.accent }}>
          Проверка обновлений приложения идёт через публичный репозиторий проекта. Установка обновлений роутера
          по-прежнему выполняется в его веб-интерфейсе.
        </Text>
      </View>

      <PageCard title="Приложение">
        <Row label="Установленная версия" value={getAppVersion()} />
        <Row
          label="Последняя версия"
          value={appUpdate ? appUpdate.latest.version : '—'}
          last
        />
        <Pressable
          onPress={checkUpdate}
          disabled={checking}
          android_ripple={{ color: colors.accentSoft }}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.accentSoft, borderColor: colors.accent }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: colors.accent, marginLeft: 10 }}>
            {checking ? 'Проверка…' : 'Проверить обновления'}
          </Text>
        </Pressable>
        {appUpdate?.hasUpdate ? (
          <Pressable
            onPress={() => Linking.openURL(appUpdate.latest.assetUrl ?? appUpdate.latest.url)}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [styles.btn, styles.btnAccent, { backgroundColor: colors.accent, marginTop: Spacing.sm }, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="download-outline" size={18} color="#FFFFFF" />
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: '#FFFFFF', marginLeft: 10 }}>
              Скачать {appUpdate.latest.version}
            </Text>
          </Pressable>
        ) : null}
        {appUpdate && !appUpdate.hasUpdate ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.online} />
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.online }}>
              Установлена последняя версия
            </Text>
          </View>
        ) : null}
      </PageCard>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data ? (
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
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
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
});