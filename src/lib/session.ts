import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { base64UrlToBytes, bytesToBase64Url, bytesToUtf8, utf8ToBytes } from './bytes';
import type { Credentials } from './digest';

/**
 * Сохранение сессии: данные роутера под пин-кодом и отпечатком пальца.
 *
 * Задача непростая из-за самого пина: четыре цифры — это всего 10 000
 * вариантов, и хранить его хеш бессмысленно, такой хеш подберут мгновенно.
 * Поэтому пин здесь ничего не «подтверждает» — он выводит ключ, которым
 * зашифрованы данные. Неверный пин проявляется как ошибка расшифровки,
 * а не как несовпадение с сохранённым значением: сверять нечего.
 *
 * Устройство — «конверт» с двумя ключами:
 *
 *   пин ──scrypt──► KEK ──разворачивает──► DEK ──расшифровывает──► {логин, пароль}
 *                                          ▲
 *   отпечаток ──SecureStore под биометрией─┘
 *
 * DEK — случайные 32 байта, они и шифруют данные. Так сделано ради
 * отпечатка: из пина ключ не вывести, а биометрия умеет только разрешить
 * или запретить доступ к тому, что лежит в защищённом хранилище. Поэтому
 * вторая копия DEK кладётся туда под системную биометрию, и оба пути —
 * пин и отпечаток — приводят к одному и тому же ключу.
 *
 * Что где лежит:
 *   SecureStore `keenetic.session`      — конверт: DEK под пин-ключом + данные
 *   SecureStore `keenetic.session.bio`  — копия DEK под системной биометрией
 *
 * Открытого текста на устройстве не остаётся: прежний ключ AsyncStorage
 * с логином и паролем вычищается.
 *
 * ВАЖНО про движок. В Hermes нет ни `TextEncoder`, ни `globalThis.crypto`,
 * поэтому строки в байты переводит свой кодек из `./bytes`, а случайность
 * берётся из `expo-crypto`. Библиотечным `utf8ToBytes`/`randomBytes` из
 * `@noble` пользоваться нельзя — они опираются на эти отсутствующие
 * глобалы. В scrypt и GCM передаются только `Uint8Array`.
 */

/** Ключ конверта в защищённом хранилище. */
const RECORD_KEY = 'keenetic.session';
/** Ключ копии DEK, доступной по отпечатку. */
const BIO_KEY = 'keenetic.session.bio';

/** Сколько цифр в пине. */
export const PIN_LENGTH = 4;

/**
 * Параметры scrypt. N записан и в самой записи, поэтому его можно менять,
 * не ломая уже сохранённые сессии: при разблокировке берётся то значение,
 * с которым запись создавалась.
 *
 * N = 16384 даёт 16 МиБ памяти на попытку. Для пина из четырёх цифр это
 * важнее числа итераций: перебор упирается в память, а не только в процессор.
 */
const KDF = { N: 16384, r: 8, p: 1, dkLen: 32 } as const;

type KdfParams = { N: number; r: number; p: number; dkLen: number };

/** Зашифрованное поле: вектор и шифртекст с тегом. */
interface Sealed {
  iv: string;
  ct: string;
}

/** Содержимое конверта. */
interface SessionRecord {
  v: 1;
  kdf: 'scrypt';
  kdfParams: KdfParams;
  salt: string;
  wrappedDek: Sealed;
  creds: Sealed;
  biometricEnabled: boolean;
}

// ── Примитивы ────────────────────────────────────────────────
// Всё, что ниже, работает только с байтами: строки сюда не попадают,
// поэтому небезопасные для Hermes ветки библиотек не выполняются.

function toSealed(iv: Uint8Array, sealed: Uint8Array): Sealed {
  return { iv: bytesToBase64Url(iv), ct: bytesToBase64Url(sealed) };
}

function seal(key: Uint8Array, plain: Uint8Array): Sealed {
  const iv = Crypto.getRandomBytes(12);
  return toSealed(iv, gcm(key, iv).encrypt(plain));
}

/** Расшифровывает поле. Бросает исключение, если ключ не тот или данные испорчены. */
function open(key: Uint8Array, field: Sealed): Uint8Array {
  return gcm(key, base64UrlToBytes(field.iv)).decrypt(base64UrlToBytes(field.ct));
}

/** Выводит ключ из пина. Пин передаётся байтами — см. замечание про Hermes выше. */
async function deriveKek(pin: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(pin), salt, {
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: params.dkLen,
  });
}

// ── Чтение и запись конверта ─────────────────────────────────

async function readRecord(): Promise<SessionRecord | null> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(RECORD_KEY);
  } catch {
    // Хранилище недоступно — считаем, что сессии нет.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    if (parsed?.v !== 1 || !parsed.salt || !parsed.wrappedDek || !parsed.creds) return null;
    return parsed;
  } catch {
    // Запись повреждена: молча считаем её отсутствующей, чтобы приложение
    // не оказалось запертым без возможности войти.
    return null;
  }
}

async function writeRecord(record: SessionRecord): Promise<void> {
  await SecureStore.setItemAsync(RECORD_KEY, JSON.stringify(record));
}

/** Есть ли сохранённая сессия. */
export async function hasSession(): Promise<boolean> {
  return (await readRecord()) !== null;
}

/** Включён ли вход по отпечатку. */
export async function isBiometricEnabled(): Promise<boolean> {
  const record = await readRecord();
  return record?.biometricEnabled === true;
}

// ── Создание сессии ──────────────────────────────────────────

/**
 * Сохраняет данные роутера под пин-кодом.
 *
 * Вызывается и при первом включении, и когда сохранение уже включено, а
 * пользователь сменил логин с паролем — поэтому запись создаётся заново.
 *
 * @returns созданный ключ данных. Он нужен вызывающей стороне, чтобы сразу
 *          завести отпечаток: спрашивать для этого пин заново незачем.
 */
export async function saveSession(pin: string, creds: Credentials): Promise<Uint8Array> {
  const dek = Crypto.getRandomBytes(32);
  const salt = Crypto.getRandomBytes(16);
  const params: KdfParams = { ...KDF };

  const kek = await deriveKek(pin, salt, params);

  const record: SessionRecord = {
    v: 1,
    kdf: 'scrypt',
    kdfParams: params,
    salt: bytesToBase64Url(salt),
    wrappedDek: seal(kek, dek),
    creds: seal(dek, utf8ToBytes(JSON.stringify(creds))),
    // Отпечаток, если он был включён, привязывался к прежнему DEK —
    // после пересоздания записи его нужно заводить заново.
    biometricEnabled: false,
  };

  await writeRecord(record);
  await clearBiometricKey();
  return dek;
}

/**
 * Разблокировка по пину.
 *
 * Неверный пин неотличим от испорченной записи: в обоих случаях не сходится
 * тег GCM. Так и задумано — сверять пин не с чем.
 */
export async function unlock(pin: string): Promise<Credentials | null> {
  const record = await readRecord();
  if (!record) return null;

  try {
    const kek = await deriveKek(pin, base64UrlToBytes(record.salt), record.kdfParams);
    const dek = open(kek, record.wrappedDek);
    return decryptCreds(record, dek);
  } catch {
    return null;
  }
}

function decryptCreds(record: SessionRecord, dek: Uint8Array): Credentials {
  const parsed = JSON.parse(bytesToUtf8(open(dek, record.creds))) as Credentials;
  if (typeof parsed?.user !== 'string' || typeof parsed?.pass !== 'string') {
    throw new Error('Повреждённая запись сессии');
  }
  return parsed;
}

// ── Смена пина ───────────────────────────────────────────────

/**
 * Меняет пин, не трогая данные роутера.
 *
 * Данные зашифрованы DEK, а DEK — лишь обёрнут ключом от пина. Значит,
 * достаточно перевернуть обёртку: сам DEK уже известен после успешной
 * разблокировки, и пароль роутера спрашивать не нужно.
 *
 * @param dek действующий ключ данных, полученный при разблокировке
 * @returns false, если DEK не подошёл к записи
 */
export async function changePin(dek: Uint8Array, newPin: string): Promise<boolean> {
  const record = await readRecord();
  if (!record) return false;

  // Проверяем, что DEK действительно от этой записи, — иначе перезапись
  // обёртки сделала бы данные нечитаемыми навсегда.
  try {
    decryptCreds(record, dek);
  } catch {
    return false;
  }

  const salt = Crypto.getRandomBytes(16);
  const params: KdfParams = { ...record.kdfParams };
  const kek = await deriveKek(newPin, salt, params);

  await writeRecord({
    ...record,
    salt: bytesToBase64Url(salt),
    wrappedDek: seal(kek, dek),
  });

  // Копия для отпечатка привязана к DEK, а он не изменился — но обновим её,
  // чтобы запись оставалась согласованной с текущим пин-ключом.
  if (record.biometricEnabled) {
    await storeBiometricKey(dek);
  }
  return true;
}

// ── Текущий DEK ──────────────────────────────────────────────

/**
 * Достаёт DEK по пину. Нужен там, где после разблокировки требуется
 * менять запись, — например при смене пина.
 */
export async function unlockDek(pin: string): Promise<Uint8Array | null> {
  const record = await readRecord();
  if (!record) return null;
  try {
    const kek = await deriveKek(pin, base64UrlToBytes(record.salt), record.kdfParams);
    return open(kek, record.wrappedDek);
  } catch {
    return null;
  }
}

/** Данные роутера по уже полученному DEK. */
export async function credsFromDek(dek: Uint8Array): Promise<Credentials | null> {
  const record = await readRecord();
  if (!record) return null;
  try {
    return decryptCreds(record, dek);
  } catch {
    return null;
  }
}

// ── Отпечаток пальца ─────────────────────────────────────────

/**
 * Кладёт копию DEK под системную биометрию.
 *
 * `requireAuthentication` означает, что система спросит отпечаток перед
 * выдачей значения. На Android это спрашивается и при записи.
 */
async function storeBiometricKey(dek: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(BIO_KEY, bytesToBase64Url(dek), {
    requireAuthentication: true,
    authenticationPrompt: 'Подтвердите вход в роутер',
  });
}

/**
 * Заводит вход по отпечатку: кладёт копию DEK под биометрию и отмечает
 * это в записи. Сам отпечаток система спросит уже здесь — так пользователь
 * сразу видит, что вход работает, а не узнаёт об отказе при следующем запуске.
 */
export async function enableBiometrics(dek: Uint8Array): Promise<boolean> {
  const record = await readRecord();
  if (!record) return false;

  // Проверяем, что DEK от этой записи, — иначе заведомо сохраним мусор.
  try {
    decryptCreds(record, dek);
  } catch {
    return false;
  }

  try {
    await storeBiometricKey(dek);
  } catch {
    return false; // пользователь отменил или биометрия недоступна
  }

  await writeRecord({ ...record, biometricEnabled: true });
  return true;
}

/** Выключает вход по отпечатку. */
export async function disableBiometrics(): Promise<void> {
  const record = await readRecord();
  await clearBiometricKey();
  if (record) await writeRecord({ ...record, biometricEnabled: false });
}

async function clearBiometricKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BIO_KEY);
  } catch {
    // ключа могло не быть
  }
}

/**
 * Разблокировка по отпечатку.
 *
 * Возвращает null, если биометрия не прошла. Отдельно стоит помнить про
 * смену отпечатка в системе: тогда системный ключ становится недействительным
 * и хранилище отдаёт пусто. Это не ошибка записи — лечится входом по пину
 * и повторным включением отпечатка.
 */
export async function unlockWithBiometrics(): Promise<Credentials | null> {
  const record = await readRecord();
  if (!record?.biometricEnabled) return null;

  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(BIO_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Подтвердите вход в роутер',
    });
  } catch {
    return null; // отменили или ключ стал недействителен
  }
  if (!stored) return null;

  try {
    return decryptCreds(record, base64UrlToBytes(stored));
  } catch {
    return null;
  }
}

// ── Полный вход по отпечатку, включая DEK ────────────────────

/**
 * Разблокировка по отпечатку, которая вдобавок отдаёт сам DEK.
 * Он нужен, чтобы после входа можно было сменить пин или перезаписать
 * биометрический ключ, если тот устарел.
 */
export async function unlockDekWithBiometrics(): Promise<{ dek: Uint8Array; creds: Credentials } | null> {
  const record = await readRecord();
  if (!record?.biometricEnabled) return null;

  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(BIO_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Подтвердите вход в роутер',
    });
  } catch {
    return null;
  }
  if (!stored) return null;

  const dek = base64UrlToBytes(stored);
  try {
    return { dek, creds: decryptCreds(record, dek) };
  } catch {
    return null;
  }
}

// ── Сброс ────────────────────────────────────────────────────

/** Стирает сессию. Данные роутера на устройстве не остаётся. */
export async function wipeSession(): Promise<void> {
  await clearBiometricKey();
  try {
    await SecureStore.deleteItemAsync(RECORD_KEY);
  } catch {
    // записи могло не быть
  }
}

/** Доступно ли защищённое хранилище (на веб-платформе его нет). */
export async function isSessionStorageAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}