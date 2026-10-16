export function formatBytes(bytes: number | string | undefined | null, decimals = 1): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (n == null || isNaN(n as number) || n <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.min(Math.floor(Math.log(n as number) / Math.log(1024)), units.length - 1);
  const value = (n as number) / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatPackets(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (num == null || isNaN(num as number)) return '—';
  return (num as number).toLocaleString('ru-RU');
}

export function formatDuration(seconds: number | string | undefined | null): string {
  let s = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (s == null || isNaN(s as number) || s < 0) return '—';
  s = Math.floor(s as number);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0 || days > 0) parts.push(`${hours} ч`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes} мин`);
  parts.push(`${secs} с`);
  return parts.join(' ');
}

export function formatPercent(n: number | string | undefined | null, decimals = 1): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num == null || isNaN(num as number)) return '—';
  return `${(num as number).toFixed(decimals)}%`;
}

export function formatNumber(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num == null || isNaN(num as number)) return '—';
  return (num as number).toLocaleString('ru-RU');
}

export function humanizeKey(key: string): string {
  const map: Record<string, string> = {
    hwaddr: 'MAC',
    ip: 'IP',
    mac: 'MAC',
    ssid: 'SSID',
    mtu: 'MTU',
    rx: 'Приём',
    tx: 'Передача',
    uptime: 'Время работы',
    platform: 'Платформа',
    model: 'Модель',
    fw_version: 'Версия ПО',
    firmware: 'Прошивка',
    serial: 'Серийный номер',
    device: 'Устройство',
    title: 'Название',
    domain: 'Домен',
    hostname: 'Имя хоста',
    cpu: 'Процессор',
    memory: 'Память',
    cores: 'Ядра',
    load: 'Загрузка',
    used: 'Использовано',
    capacity: 'Объём',
    free: 'Свободно',
    interface: 'Интерфейс',
    'interface-name': 'Интерфейс',
    connected: 'Подключён',
    link: 'Ссылка',
    speed: 'Скорость',
    duplex: 'Дуплекс',
    type: 'Тип',
    role: 'Роль',
    channel: 'Канал',
    security: 'Безопасность',
    encryption: 'Шифрование',
    packets: 'Пакеты',
    errors: 'Ошибки',
    bytes: 'Байты',
    name: 'Имя',
    clients: 'Клиенты',
    count: 'Количество',
    version: 'Версия',
    build: 'Сборка',
    state: 'Состояние',
    enabled: 'Включено',
    description: 'Описание',
    gateway: 'Шлюз',
    mask: 'Маска',
    'ip-name': 'IP-адрес',
    expires: 'Истекает',
    flags: 'Флаги',
  };
  if (map[key]) return map[key];
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function boolText(v: any): string {
  if (v === true || v === 'true' || v === 'yes' || v === 'on' || v === 1 || v === '1') return 'Да';
  if (v === false || v === 'false' || v === 'no' || v === 'off' || v === 0 || v === '0') return 'Нет';
  return String(v);
}

export function isOnline(v: any): boolean {
  const s = String(v ?? '').toLowerCase();
  return s === 'up' || s === 'online' || s === 'yes' || s === 'true' || s === 'on' || s === 'active' || s === '1';
}
