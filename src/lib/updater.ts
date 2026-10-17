import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { checkForAppUpdate, type UpdateCheckResult } from './version';

/**
 * Скачивание и установка обновления приложения.
 *
 * APK качается в кэш приложения, после чего открывается системный установщик.
 * Android покажет своё подтверждение установки — обойти его нельзя и не нужно:
 * это защита пользователя.
 */

export interface DownloadProgress {
  /** 0…1, либо null, если общий размер неизвестен. */
  progress: number | null;
  /** Скачано байт. */
  written: number;
  total: number;
}

export type UpdateStage =
  | { stage: 'idle' }
  | { stage: 'checking' }
  | { stage: 'available'; info: UpdateCheckResult }
  | { stage: 'uptodate'; info: UpdateCheckResult }
  | { stage: 'downloading'; info: UpdateCheckResult; progress: DownloadProgress }
  | { stage: 'installing'; info: UpdateCheckResult }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

/** Проверяет, есть ли новая версия. */
export async function checkUpdate(): Promise<UpdateCheckResult> {
  return checkForAppUpdate();
}

/**
 * Скачивает APK обновления и открывает системный установщик.
 *
 * @param onProgress вызывается по мере загрузки
 */
export async function downloadAndInstall(
  info: UpdateCheckResult,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Установка обновления доступна только на Android.');
  }

  const url = info.latest.assetUrl;
  if (!url) {
    throw new Error('В релизе нет файла APK — обновление можно скачать вручную со страницы релизов.');
  }

  const name = info.latest.assetName ?? `KeeneticGiga-${info.latest.version}.apk`;
  const target = `${FileSystem.cacheDirectory}${name}`;

  // Прошлый файл мог остаться — иначе downloadAsync откажется перезаписывать.
  try {
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // не критично: файл просто отсутствует
  }

  const task = FileSystem.createDownloadResumable(url, target, {}, (data) => {
    const total = data.totalBytesExpectedToWrite || 0;
    onProgress?.({
      progress: total > 0 ? data.totalBytesWritten / total : null,
      written: data.totalBytesWritten,
      total,
    });
  });

  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error('Не удалось скачать обновление.');

  // Установщику нужен content:// — по file:// Android откажет.
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}

/** Человекочитаемый размер файла. */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}