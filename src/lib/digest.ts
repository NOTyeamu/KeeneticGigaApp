export interface Credentials {
  user: string;
  pass: string;
}

export class AuthError extends Error {
  constructor(message = 'Неверный логин или пароль.') {
    super(message);
    this.name = 'AuthError';
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Не удалось подключиться к роутеру. Проверьте подключение к сети.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface DigestResponse {
  ok: boolean;
  status: number;
  getHeader: (name: string) => string | null;
  text: () => Promise<string>;
}

export interface DigestFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  credentials: Credentials;
}

interface NativeFetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
  error?: string;
  detail?: string;
}

interface ProbeResult {
  reachable: boolean;
  reason: string;
  status?: number;
  /** Адрес, который ответил в итоге (учитывая перенаправления). */
  host?: string;
  /** true, если ответил сам роутер по домашнему адресу, а не внешняя инфраструктура. */
  local?: boolean;
}

interface DigestHttpNative {
  fetch(options: Record<string, unknown>): Promise<NativeFetchResult>;
  probe(url: string, timeoutMs?: number): Promise<ProbeResult>;
}

/**
 * Модуль подключается лениво и безопасно: если сборка сделана без нативного
 * кода (например, в Expo Go), приложение запустится и покажет внятную ошибку
 * вместо падения на этапе импорта.
 */
function loadNative(): DigestHttpNative | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../modules/digest-http');
    return (mod?.default ?? mod) as DigestHttpNative;
  } catch {
    return null;
  }
}

const native = loadNative();

/**
 * Быстро проверяет, доступен ли роутер по адресу. Используется, чтобы выбрать
 * между локальным адресом и внешней ссылкой, не дожидаясь полного таймаута.
 */
export async function probeUrl(url: string, timeoutMs = 2500): Promise<ProbeResult> {
  if (!native) return { reachable: false, reason: 'no_native' };
  try {
    return await native.probe(url, timeoutMs);
  } catch {
    return { reachable: false, reason: 'error' };
  }
}

/**
 * Запрос к роутеру с авторизацией NDW2. Логика авторизации живёт в нативном
 * модуле `modules/digest-http` (OkHttp + CookieJar), потому что она требует
 * MD5/SHA-256 и переиспользования сессионной куки.
 */
export async function digestFetch(url: string, opts: DigestFetchOptions): Promise<DigestResponse> {
  const { method = 'GET', body, headers = {}, credentials } = opts;

  if (!native) {
    throw new NetworkError('Нативный HTTP-модуль недоступен. Пересоберите приложение.');
  }

  const bodyStr = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);

  let result: NativeFetchResult;
  try {
    result = await native.fetch({
      url,
      method,
      user: credentials.user,
      pass: credentials.pass,
      headers,
      body: bodyStr,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout|timed out/i.test(msg)) {
      throw new NetworkError('Роутер не ответил за отведённое время.');
    }
    if (/invalid credentials|root auth failed/i.test(msg)) {
      throw new AuthError();
    }
    if (/auth failed/i.test(msg)) {
      throw new AuthError('Не удалось авторизоваться на роутере. Проверьте логин и пароль.');
    }
    if (/network|connect|unreachable|host/i.test(msg)) {
      throw new NetworkError();
    }
    throw new NetworkError(msg);
  }

  if (result.error === 'wrong_address') {
    throw new NetworkError(result.detail || 'По указанному адресу роутер не найден.');
  }

  if (result.error === 'auth_not_supported') {
    throw new AuthError(result.detail || 'Роутер не сообщил параметры авторизации.');
  }

  if (result.error === 'auth_failed') {
    throw new AuthError(
      result.detail
        ? `Не удалось авторизоваться на роутере. ${result.detail}`
        : 'Не удалось авторизоваться на роутере. Проверьте логин и пароль.',
    );
  }

  if (result.error === 'network') {
    throw new NetworkError(result.detail || undefined);
  }

  if (result.status === 401) {
    throw new AuthError();
  }

  return {
    ok: result.ok,
    status: result.status,
    getHeader: (name: string) => result.headers[name.toLowerCase()] ?? null,
    text: () => Promise.resolve(result.body),
  };
}