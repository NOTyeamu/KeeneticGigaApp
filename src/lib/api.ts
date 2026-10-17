import {
  digestFetch,
  probeUrl,
  AuthError,
  HttpError,
  NetworkError,
  type Credentials,
} from './digest';
import { Storage } from './storage';

/**
 * Домашний адрес по умолчанию — типовой адрес роутеров Keenetic в локальной
 * сети. Пользователь может его изменить на экране входа; хранится только на
 * устройстве, поэтому в исходниках и в APK чужих адресов нет.
 */
export const DEFAULT_BASE_URL = 'http://192.168.0.1/rci/';

/**
 * Запасной домашний адрес: то же устройство по своему доменному имени.
 * Keenetic отвечает на него из локальной сети даже если адрес подсети
 * изменён, поэтому он используется, когда основной адрес не отвечает.
 */
export const ALT_LOCAL_URLS = ['http://my.keenetic.net/rci/'];

/** Приводит адрес к виду <origin>/auth — по нему проверяется доступность. */
function authEndpoint(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.protocol}//${parsed.host}/auth`;
  } catch {
    return baseUrl;
  }
}

/**
 * Локальный адрес — используется по умолчанию. Внешний (KeenDNS) подключается
 * только когда локальная сеть недоступна: дома вход идёт напрямую к роутеру,
 * а вне дома — по ссылке.
 */
let localUrl = DEFAULT_BASE_URL;
let remoteUrl: string | null = null;

/** Адрес, через который сейчас идёт общение с роутером. */
let baseUrl = DEFAULT_BASE_URL;

/** Что выбрано сейчас и почему — показывается в настройках. */
export type RouteKind = 'local' | 'remote';
let routeKind: RouteKind = 'local';
let routeReason = '';

const PROBE_TIMEOUT_MS = 2200;

export function getBaseUrl(): string {
  return baseUrl;
}

export function getLocalUrl(): string {
  return localUrl;
}

export function getRemoteUrl(): string | null {
  return remoteUrl;
}

export function hasRemoteUrl(): boolean {
  return remoteUrl !== null && remoteUrl !== '';
}

export function getRouteInfo(): { kind: RouteKind; url: string; reason: string } {
  return { kind: routeKind, url: baseUrl, reason: routeReason };
}

/** Normalise a user-entered URL into a valid /rci/ base URL. */
export function normalizeBaseUrl(input: string): string {
  let u = input.trim();
  if (!u) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  // Strip a trailing path/file but keep the host; force /rci/ suffix.
  try {
    const parsed = new URL(u);
    u = parsed.protocol + '//' + parsed.host + '/rci/';
  } catch {
    u = DEFAULT_BASE_URL;
  }
  return u;
}

/**
 * Выбирает рабочий адрес: сначала локальный, при недоступности — внешний.
 * Возвращает true, если хоть один адрес отвечает.
 */
export async function resolveRoute(force = false): Promise<boolean> {
  // Уже проверяли и адрес отвечает — не тратим время на повторную проверку.
  if (!force && routeReason === 'ok') return true;

  // Перебираем домашние адреса: основной и запасной по доменному имени.
  // Запасной выручает, если адрес подсети на роутере изменён.
  const localCandidates = [localUrl, ...ALT_LOCAL_URLS.filter((u) => normalizeBaseUrl(u) !== localUrl)];
  for (const candidate of localCandidates) {
    const localOk = await probeUrl(authEndpoint(candidate), PROBE_TIMEOUT_MS);
    // Домашним считаем только ответ самого роутера: у my.keenetic.net есть
    // публичная DNS-запись, и вне дома он отвечает, но не является роутером.
    if (localOk.reachable && localOk.local !== false) {
      localUrl = candidate;
      baseUrl = candidate;
      routeKind = 'local';
      routeReason = 'ok';
      return true;
    }
  }

  if (remoteUrl) {
    const remoteOk = await probeUrl(authEndpoint(remoteUrl), PROBE_TIMEOUT_MS);
    if (remoteOk.reachable) {
      baseUrl = remoteUrl;
      routeKind = 'remote';
      routeReason = 'ok';
      return true;
    }
    routeReason = 'unreachable';
    return false;
  }

  // Внешний адрес не задан — остаёмся на локальном, чтобы ошибка была понятной.
  baseUrl = localUrl;
  routeKind = 'local';
  routeReason = 'unreachable';
  return false;
}

/** Задаёт локальный адрес. */
export async function setBaseUrl(next: string, persist = true): Promise<void> {
  localUrl = normalizeBaseUrl(next);
  await Storage.setBaseUrl(localUrl);
  if (persist) await resolveRoute(true);
}

/** Задаёт внешний адрес (KeenDNS). null — убрать. */
export async function setRemoteUrl(next: string | null, persist = true): Promise<void> {
  remoteUrl = next ? normalizeBaseUrl(next) : null;
  if (persist) await Storage.setRemoteUrl(remoteUrl);
  await resolveRoute(true);
}

/** Load the persisted URLs into the module once at app boot. */
export async function loadBaseUrl(): Promise<void> {
  const storedLocal = await Storage.getBaseUrl();
  if (storedLocal) localUrl = normalizeBaseUrl(storedLocal);
  const storedRemote = await Storage.getRemoteUrl();
  if (storedRemote) remoteUrl = normalizeBaseUrl(storedRemote);
  baseUrl = localUrl;
}

export const BASE_URL = DEFAULT_BASE_URL;
export type { Credentials, AuthError, HttpError, NetworkError };

function describeStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Неверный запрос к роутеру.';
    case 401:
      return 'Неверный логин или пароль.';
    case 403:
      return 'Доступ запрещён.';
    case 404:
      return 'Раздел не найден на роутере.';
    case 500:
      return 'Внутренняя ошибка роутера.';
    case 502:
    case 503:
    case 504:
      return 'Роутер временно недоступен.';
    default:
      return `Ошибка запроса (${status}).`;
  }
}

/** Другой адрес для повторной попытки, если текущий не ответил. */
function alternativeUrl(): string | null {
  if (routeKind === 'local') return remoteUrl;
  return localUrl;
}

async function request(path: string, creds: Credentials, method = 'GET', body?: unknown): Promise<any> {
  const cleanPath = path.replace(/^\/+/, '');

  // Первый запрос — выбираем рабочий адрес (локальный, иначе внешний).
  await resolveRoute();

  let res: Awaited<ReturnType<typeof digestFetch>>;
  try {
    res = await digestFetch(baseUrl + cleanPath, { method, credentials: creds, body });
  } catch (e) {
    // Адрес перестал отвечать (ушли из дома или вернулись) — пробуем другой.
    const other = alternativeUrl();
    if (other && e instanceof NetworkError) {
      const swapped = await resolveRoute(true);
      if (swapped) {
        res = await digestFetch(baseUrl + cleanPath, { method, credentials: creds, body });
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  if (!res.ok) {
    if (res.status === 401) throw new AuthError();
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      detail = '';
    }
    const base = describeStatus(res.status);
    throw new HttpError(res.status, detail ? `${base}` : base);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const Api = {
  system: (c: Credentials) => request('show/system', c),
  interface: (c: Credentials) => request('show/interface', c),
  arp: (c: Credentials) => request('show/ip/arp', c),
  hotspot: (c: Credentials) => request('show/ip/hotspot', c),
  rc: (c: Credentials) => request('show/rc', c),
  processes: (c: Credentials) => request('show/processes', c),
  version: (c: Credentials) => request('show/version', c),
  internetStatus: (c: Credentials) => request('show/internet/status', c),
  associations: (c: Credentials) => request('show/associations', c),
  media: (c: Credentials) => request('show/media', c),
  ndns: (c: Credentials) => request('show/ndns', c),
  clock: (c: Credentials) => request('show/clock/date', c),
  defaults: (c: Credentials) => request('show/defaults', c),
  mws: (c: Credentials) => request('show/mws/member', c),
  interfaceStat: (c: Credentials, name: string) => request('show/interface/stat?name=' + encodeURIComponent(name), c),
  /** Загруженность канала (CLI: show interface <name> chan-util) — есть не на всех прошивках. */
  chanUtil: (c: Credentials, name: string) => request('show/interface/chan-util?name=' + encodeURIComponent(name), c),
  /** Список rrd-ресурсов роутера (источник графиков веба), если отдаётся. */
  rrdList: (c: Credentials) => request('show/rrd', c),
  /** Сканирование каналов Wi-Fi мастера (CLI: show interface <name> channels). */
  interfaceChannels: (c: Credentials, name: string) => request('show/interface/channels?name=' + encodeURIComponent(name), c),
  /** График «Загруженность канала» Wi-Fi-мастера — реальные замеры прошивки каждые ~3 с
   *  (формат запроса взят из DevTools веба 5.1: t = аптайм (с), v.load = % занятости эфира). */
  chanUtilChart: (c: Credentials, name: string) =>
    request('', c, 'POST', [{ show: { interface: { 'channel-utilization': { chart: { name, detail: 0 } } } } }]),
  // --- Управление роутером ---
  /** Перезагрузка роутера (CLI: system reboot). */
  reboot: (c: Credentials) => request('system/reboot', c, 'POST', {}),
  /** Состояния системных сервисов из running-config (GET show rc пуст на 5.x — читаем POST-ом). */
  rcServices: (c: Credentials) => request('', c, 'POST', [{ show: { rc: { service: {} } } }]),
  /** Включить/выключить системный сервис (CLI: service <name>) и сохранить конфигурацию. */
  setService: (c: Credentials, name: string, on: boolean) =>
    request('', c, 'POST', [
      { service: { [name]: on } },
      { system: { configuration: { save: {} } } },
    ]),
  /** Включить/выключить интерфейс (Wi-Fi, подключение) и сохранить конфигурацию. */
  setInterfaceUp: (c: Credentials, name: string, up: boolean) =>
    request('', c, 'POST', [
      { interface: { [name]: up ? { up: true } : { down: true } } },
      { system: { configuration: { save: {} } } },
    ]),
  environment: (c: Credentials) => request('show/environment', c),
  ipRoute: (c: Credentials) => request('show/ip/route', c),
  /** Список интернет-подключений RCI (show ip interface) — источник страницы Ethernet. */
  internetConnections: (c: Credentials) => request('show/ip/interface', c),
  /** Параметры IP-стека интерфейса: адрес, маска, шлюз (show interface <name> ip). */
  interfaceIp: (c: Credentials, name: string) =>
    request('show/interface/ip?name=' + encodeURIComponent(name), c),
  /** Настройки интерфейса из running-config (POST show rc interface). */
  rcInterface: (c: Credentials) =>
    request('', c, 'POST', [{ show: { rc: { interface: {} } } }]),
  /** Параметры запуска интерфейса, включая MAC/MTU/IPv6 (show interface <name> running-config). */
  interfaceConfig: (c: Credentials, name: string) =>
    request('', c, 'POST', [
      { show: { interface: { 'running-config': { name } } } },
    ]),
  /** Сохранить конфигурацию роутера. */
  saveConfig: (c: Credentials) => request('', c, 'POST', [{ system: { configuration: { save: {} } } }]),
  /** Включить/выключить интернет-подключение вместе с сохранением конфигурации. */
  setConnectionUp: (c: Credentials, id: string, up: boolean) =>
    request('', c, 'POST', [
      { interface: { [id]: up ? { up: true } : { down: true } } },
      { system: { configuration: { save: {} } } },
    ]),
  /** Задать имя провайдера (описание) для подключения. */
  setConnectionDescription: (c: Credentials, id: string, description: string) =>
    request('', c, 'POST', [
      { interface: { [id]: { description } } },
      { system: { configuration: { save: {} } } },
    ]),
  /** Удалить подключение вместе с сохранением конфигурации. */
  removeConnection: (c: Credentials, id: string) =>
    request('', c, 'POST', [
      { interface: { [id]: { remove: true } } },
      { system: { configuration: { save: {} } } },
    ]),
  /** Создать подключение провайдера через Ethernet. */
  addEthernetConnection: (c: Credentials, id: string) =>
    request('', c, 'POST', [
      { interface: { [id]: { up: true, description: id } } },
      { ip: { interface: { [id]: { address: 'dhcp' } } } },
      { system: { configuration: { save: {} } } },
    ]),
  ipDns: (c: Credentials) => request('show/ip/dns', c),
  ipDhcp: (c: Credentials) => request('show/ip/dhcp', c),
  ipHotspot: (c: Credentials) => request('show/ip/hotspot', c),
  ping: (c: Credentials, host: string, count = 4) =>
    request('ping', c, 'POST', { host, count }),
  traceroute: (c: Credentials, host: string) =>
    request('traceroute', c, 'POST', { host }),
};

export function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const arr = Object.keys(value).map((k) => {
      const v = value[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Array.isArray(v) ? v : { ...v, _key: k };
      }
      return { _key: k, value: v };
    });
    return arr;
  }
  return [];
}

export function getValue(obj: any, path: (string | number)[]): any {
  return path.reduce((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[typeof key === 'number' ? key : parseInt(String(key), 10)];
    return acc[key as string];
  }, obj);
}
