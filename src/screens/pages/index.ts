import type { ComponentType } from 'react';

import SystemMonitor from './SystemMonitor';
import TrafficMonitor from './TrafficMonitor';
import WifiMonitor from './WifiMonitor';
import Ethernet from './Ethernet';
import Mobile from './Mobile';
import WirelessIsp from './WirelessIsp';
import OtherConnections from './OtherConnections';
import ConnectionPriorities from './ConnectionPriorities';
import Devices from './Devices';
import HomeNetwork from './HomeNetwork';
import GuestNetwork from './GuestNetwork';
import WifiSystem from './WifiSystem';
import AccessPoints from './AccessPoints';
import Segments from './Segments';
import IntelliQoS from './IntelliQoS';
import InternetFilters from './InternetFilters';
import Firewall from './Firewall';
import PortForwarding from './PortForwarding';
import Routing from './Routing';
import DomainNames from './DomainNames';
import GeneralSettings from './GeneralSettings';
import SystemUpdate from './SystemUpdate';
import Backup from './Backup';
import Diagnostics from './Diagnostics';
import PcLogin from './PcLogin';

const REGISTRY: Record<string, ComponentType> = {
  SystemMonitor,
  TrafficMonitor,
  WifiMonitor,
  Ethernet,
  Mobile,
  WirelessIsp,
  OtherConnections,
  ConnectionPriorities,
  Devices,
  HomeNetwork,
  GuestNetwork,
  WifiSystem,
  AccessPoints,
  Segments,
  IntelliQoS,
  InternetFilters,
  Firewall,
  PortForwarding,
  Routing,
  DomainNames,
  GeneralSettings,
  SystemUpdate,
  Backup,
  Diagnostics,
  PcLogin,
};

export function getPageComponent(page: string): ComponentType | null {
  return REGISTRY[page] ?? null;
}
