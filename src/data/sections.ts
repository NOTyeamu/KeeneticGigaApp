import { ImageSourcePropType } from 'react-native';

import statusIconAsset from '../../assets/status_icon.png';
import internetIconAsset from '../../assets/internet_icon.png';
import wifiIconAsset from '../../assets/wifi_icon.png';
import privacityIconAsset from '../../assets/privacity_icon.png';

export interface SubItem {
  id: string;
  title: string;
  page: string;
  icon: string;
}

export interface SectionGroup {
  id: string;
  title: string;
  icon: string;
  /** Optional custom image asset for the section header icon. */
  iconAsset?: ImageSourcePropType;
  description: string;
  items: SubItem[];
}

export const SECTIONS: SectionGroup[] = [
  {
    id: 'status',
    title: 'Статус',
    icon: 'speedometer-outline',
    iconAsset: statusIconAsset,
    description: 'Мониторинг системы и сети',
    items: [
      { id: 'system-monitor', title: 'Системный монитор', page: 'SystemMonitor', icon: 'hardware-chip-outline' },
      { id: 'traffic-monitor', title: 'Монитор трафика', page: 'TrafficMonitor', icon: 'stats-chart-outline' },
      { id: 'wifi-monitor', title: 'Монитор Wi-Fi', page: 'WifiMonitor', icon: 'wifi-outline' },
    ],
  },
  {
    id: 'internet',
    title: 'Интернет',
    icon: 'globe-outline',
    iconAsset: internetIconAsset,
    description: 'Подключения и каналы',
    items: [
      { id: 'ethernet', title: 'Кабель Ethernet', page: 'Ethernet', icon: 'card-outline' },
      { id: 'mobile', title: 'Mobile', page: 'Mobile', icon: 'cellular-outline' },
      { id: 'wireless-isp', title: 'Wireless ISP', page: 'WirelessIsp', icon: 'radio-outline' },
      { id: 'other-connections', title: 'Другие подключения', page: 'OtherConnections', icon: 'git-network-outline' },
      { id: 'connection-priorities', title: 'Приоритеты подключений', page: 'ConnectionPriorities', icon: 'arrow-up-circle-outline' },
    ],
  },
  {
    id: 'networks-wifi',
    title: 'Мои сети и Wi-Fi',
    icon: 'wifi-outline',
    iconAsset: wifiIconAsset,
    description: 'Устройства и беспроводные сети',
    items: [
      { id: 'devices', title: 'Устройства', page: 'Devices', icon: 'phone-portrait-outline' },
      { id: 'home-network', title: 'Домашняя сеть', page: 'HomeNetwork', icon: 'home-outline' },
      { id: 'guest-network', title: 'Гостевая сеть', page: 'GuestNetwork', icon: 'people-outline' },
      { id: 'wifi-system', title: 'Wi-Fi система', page: 'WifiSystem', icon: 'grid-outline' },
      { id: 'access-points', title: 'Точки доступа', page: 'AccessPoints', icon: 'cube-outline' },
      { id: 'segments', title: 'Сегменты', page: 'Segments', icon: 'pricetags-outline' },
      { id: 'intelliqos', title: 'IntelliQoS', page: 'IntelliQoS', icon: 'trending-up-outline' },
    ],
  },
  {
    id: 'rules',
    title: 'Сетевые правила',
    icon: 'shield-checkmark-outline',
    iconAsset: privacityIconAsset,
    description: 'Фильтры, файрвол, маршруты',
    items: [
      { id: 'internet-filters', title: 'Интернет-фильтры', page: 'InternetFilters', icon: 'filter-outline' },
      { id: 'firewall', title: 'Межсетевой экран', page: 'Firewall', icon: 'flame-outline' },
      { id: 'port-forwarding', title: 'Переадресация портов', page: 'PortForwarding', icon: 'swap-horizontal-outline' },
      { id: 'routing', title: 'Маршрутизация', page: 'Routing', icon: 'git-branch-outline' },
      { id: 'domain-names', title: 'Доменные имена', page: 'DomainNames', icon: 'server-outline' },
    ],
  },
];

/**
 * Страницы обслуживания роутера. Показываются на вкладке «Настройки» и
 * открываются внутри её собственного стека, а не в «Разделе»: «Раздел»
 * остался только для управления роутером.
 */
export const MANAGEMENT_ITEMS: SubItem[] = [
  { id: 'general-settings', title: 'Общие настройки', page: 'GeneralSettings', icon: 'options-outline' },
  { id: 'system-update', title: 'Обновление системы', page: 'SystemUpdate', icon: 'cloud-download-outline' },
  { id: 'backup', title: 'Резервная копия', page: 'Backup', icon: 'save-outline' },
  { id: 'diagnostics', title: 'Диагностика', page: 'Diagnostics', icon: 'pulse-outline' },
];

/** Всё, что находится поиском на главной: разделы управления и обслуживание. */
export const ALL_ITEMS: SubItem[] = [...SECTIONS.flatMap((s) => s.items), ...MANAGEMENT_ITEMS];
