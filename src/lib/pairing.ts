import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { base64UrlToBytes, bytesToBase64Url, utf8ToBytes } from './bytes';

/**
 * Связка телефона с компьютером.
 *
 * На экране «Сканировать QR» компьютер показывает QR-код, телефон его
 * считывает и передаёт данные роутера обратно. Готового канала между двумя
 * чужими устройствами нет, поэтому посредником служит публичная очередь
 * ntfy.sh: компьютер подписывается на случайную «тему», телефон публикует
 * в неё одно сообщение.
 *
 * Тема — это по сути адрес в общей очереди, поэтому по ней одной данные
 * отдавать нельзя: содержимое шифруется ключом AES-GCM, который лежит
 * только в QR-коде. Ключ никогда не покидает два экрана, а на сервере
 * остаётся нечитаемый набор байт. Сообщение помечается `cache: 'no'`,
 * поэтому ntfy не хранит его даже в зашифрованном виде.
 *
 * Схема защиты рассчитана на то, что QR-код видит только владелец: кто
 * увидел код, тот получил и ключ. Поэтому сеанс одноразовый и живёт
 * считаные минуты.
 */

/** Полезная нагрузка одного сеанса связки — то, что уезжает в QR-коде. */
export interface PairTicket {
  /** Имя темы ntfy, в которую телефон отправит ответ. */
  topic: string;
  /** Ключ AES-GCM в base64url — 32 байта, то есть AES-256. */
  key: string;
}

/** Данные роутера, которые телефон передаёт компьютеру. */
export interface PairPayload {
  url: string;
  login: string;
  password: string;
}

/** Символы, допустимые ntfy в имени темы: [-_A-Za-z0-9]. */
const TOPIC_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Разбирает содержимое QR-кода. Возвращает null, если это не наш код. */
export function parseTicket(raw: string): PairTicket | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  // Проверяем метку формата: иначе случайный QR с полями topic/key
  // был бы принят за наш и данные ушли бы не туда.
  if (obj.v !== 1) return null;
  if (typeof obj.topic !== 'string' || typeof obj.key !== 'string') return null;
  if (!/^[-_A-Za-z0-9]{1,64}$/.test(obj.topic)) return null;

  // Ключ должен разбираться в ровно 32 байта — иначе это не AES-256.
  try {
    if (base64UrlToBytes(obj.key).length !== 32) return null;
  } catch {
    return null;
  }

  return { topic: obj.topic, key: obj.key };
}

/** Генерирует сеанс связки: тему для ntfy и ключ шифрования. */
export function createTicket(): PairTicket {
  const topicBytes = Crypto.getRandomBytes(16);
  let topic = 'kgp-';
  for (let i = 0; i < topicBytes.length; i++) {
    topic += TOPIC_ALPHABET[topicBytes[i] % TOPIC_ALPHABET.length];
  }
  return { topic, key: bytesToBase64Url(Crypto.getRandomBytes(32)) };
}

/** Собирает строку для QR-кода. */
export function ticketToQrValue(ticket: PairTicket): string {
  return JSON.stringify({ v: 1, topic: ticket.topic, key: ticket.key });
}

/**
 * Шифрует данные роутера ключом из QR-кода.
 *
 * Формат результата — `base64url(вектор || шифртекст || тег)`: ровно то, что
 * ожидает WebCrypto на компьютере при расшифровке.
 */
export function encryptPayload(ticket: PairTicket, payload: PairPayload): string {
  const key = base64UrlToBytes(ticket.key);
  const iv = Crypto.getRandomBytes(12);
  const sealed = gcm(key, iv).encrypt(utf8ToBytes(JSON.stringify(payload)));

  const combined = new Uint8Array(iv.length + sealed.length);
  combined.set(iv, 0);
  combined.set(sealed, iv.length);
  return bytesToBase64Url(combined);
}

/**
 * Отправляет зашифрованные данные в очередь ntfy.
 *
 * `cache: 'no'` — необязательное поле тела: сервер доставляет сообщение
 * подписчику, но не сохраняет его. Это важно, потому что тема публичная по
 * имени: без этой пометки шифртекст остался бы лежать на сервере.
 */
export async function publishToTopic(topic: string, blob: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, message: blob, cache: 'no' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Сервер передачи ответил HTTP ${res.status}.`);
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Сервер передачи не ответил за 15 секунд.');
    }
    throw e instanceof Error ? e : new Error('Не удалось передать данные на компьютер.');
  } finally {
    clearTimeout(timer);
  }
}

/** Единственный вызов, нужный экрану: зашифровать и отправить. */
export async function sendToComputer(ticket: PairTicket, payload: PairPayload): Promise<void> {
  const blob = encryptPayload(ticket, payload);
  await publishToTopic(ticket.topic, blob);
}