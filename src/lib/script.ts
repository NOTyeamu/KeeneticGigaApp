import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Сохранение скрипта для Tampermonkey как файла.
 *
 * Ссылка на .user.js не годится: Tampermonkey перехватывает установку только
 * при переходе из браузера, а из приложения такая ссылка открывается либо
 * «никак», либо как обычный текст. Поэтому файл скачивается в память и
 * предлагается сохранить — дальше пользователь открывает его из Tampermonkey.
 */

const SCRIPT_URL = 'https://notyeamu.github.io/KeeneticGigaApp/keenetic-pair.user.js';
const FILE_NAME = 'keenetic-pair.user.js';

export interface SavedFile {
  /** Куда сохранили — путь или облачный URI. */
  location: string;
}

/** Скачивает скрипт и открывает системный диалог сохранения. */
export async function downloadScript(): Promise<SavedFile> {
  const target = `${FileSystem.cacheDirectory}${FILE_NAME}`;

  // Прошлый файл мог остаться — downloadAsync откажется перезаписывать.
  try {
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // не критично: файла просто нет
  }

  const result = await FileSystem.downloadAsync(SCRIPT_URL, target);
  if (!result?.uri || (result.status ?? 200) >= 400) {
    throw new Error('Не удалось скачать скрипт. Проверьте подключение к интернету.');
  }

  // На Android предлагаем выбрать папку: файл ляжет в «Загрузки» или куда
  // укажет пользователь. Диалог системный, обойти его не нужно.
  if (Platform.OS === 'android') {
    const text = await FileSystem.readAsStringAsync(result.uri);
    const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Сохранение отменено.');
    }

    // Имя передаём целиком, вместе с расширением, хотя обычно его тут
    // опускают. Android дописывает расширение по MIME-типу, если в имени
    // его нет: из «keenetic-pair» вышел бы «keenetic-pair.js», а Tampermonkey
    // опознаёт скрипт только по двойному «.user.js» и такой файл проигнорирует.
    // С готовым расширением дописывать нечего, и имя остаётся как нужно.
    const dest = await FileSystem.StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      FILE_NAME,
      'text/javascript',
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(dest, text);
    return { location: dest };
  }

  // На остальных платформах файл остаётся в кэше приложения.
  return { location: result.uri };
}

/** Прямая ссылка на скрипт — её можно открыть на компьютере. */
export const SCRIPT_LINK = SCRIPT_URL;
export const SCRIPT_FILE_NAME = FILE_NAME;