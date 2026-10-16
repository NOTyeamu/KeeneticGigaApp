import { InterfaceListPage } from '../../components/InterfaceListPage';
import { filterWirelessIsp } from '../../lib/interfaces';

export default function WirelessIsp() {
  return <InterfaceListPage filter={filterWirelessIsp()} emptyTitle="Wireless ISP не найден" emptySubtitle="На роутере не настроено беспроводное подключение к провайдеру." />;
}
