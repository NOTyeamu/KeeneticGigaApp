import { toArray } from './api';

export interface Iface {
  id?: string;
  interface_name?: string;
  'interface-name'?: string;
  name?: string;
  interface?: string;
  _key?: string;
  type?: string;
  link?: string;
  connected?: string;
  up?: string;
  enabled?: string;
  speed?: string;
  duplex?: string;
  mac?: string;
  hwaddr?: string;
  mtu?: number;
  role?: string | string[];
  security?: any;
  ssid?: string;
  channel?: string | number;
  rx?: any;
  tx?: any;
  [k: string]: any;
}

export function ifaceId(i: Iface): string {
  return i.id || i.interface_name || i['interface-name'] || i.interface || i.name || i._key || '—';
}

export function ifaceName(i: Iface): string {
  return i['interface-name'] || i.name || i.id || i.interface || i._key || '—';
}

export function hasRole(i: Iface, role: string): boolean {
  const r = i.role;
  if (!r) return false;
  if (Array.isArray(r)) return r.map((x) => String(x).toLowerCase()).includes(role.toLowerCase());
  return String(r).toLowerCase() === role.toLowerCase();
}

export function isUp(i: Iface): boolean {
  const link = String(i.link ?? '').toLowerCase();
  const conn = String(i.connected ?? '').toLowerCase();
  const up = String(i.up ?? '').toLowerCase();
  return link === 'up' || conn === 'yes' || up === 'up' || link === 'online';
}

export function ifaceType(i: Iface): string {
  return String(i.type ?? '').toLowerCase();
}

export function asInterfaces(data: unknown): Iface[] {
  return toArray(data) as Iface[];
}

export function filterEthernet(internet = true): (i: Iface) => boolean {
  return (i) => {
    if (internet && !hasRole(i, 'inet')) return false;
    const t = ifaceType(i);
    const id = ifaceId(i).toLowerCase();
    return t.includes('ethernet') || id.startsWith('gigabitethernet') || id.startsWith('ethernet') || id.includes('wan');
  };
}

export function filterMobile(): (i: Iface) => boolean {
  return (i) => {
    const t = ifaceType(i);
    const id = ifaceId(i).toLowerCase();
    return (
      t.includes('mobile') ||
      t.includes('3g') ||
      t.includes('4g') ||
      t.includes('lte') ||
      t.includes('ppp') ||
      id.includes('mobile') ||
      id.includes('cdce') ||
      id.includes('3g') ||
      id.includes('4g') ||
      id.includes('lte')
    );
  };
}

export function filterWirelessIsp(): (i: Iface) => boolean {
  return (i) => {
    const t = ifaceType(i);
    const id = ifaceId(i).toLowerCase();
    return t.includes('wirelessstation') || t.includes('wisp') || id.includes('wifistation') || id.includes('wisp');
  };
}

export function filterOther(): (i: Iface) => boolean {
  return (i) => {
    if (!hasRole(i, 'inet')) return false;
    return !(filterEthernet()(i) || filterMobile()(i) || filterWirelessIsp()(i));
  };
}
