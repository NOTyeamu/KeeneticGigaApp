import { InterfaceListPage } from '../../components/InterfaceListPage';
import { filterOther } from '../../lib/interfaces';

export default function OtherConnections() {
  return <InterfaceListPage filter={filterOther()} emptyTitle="Других подключений нет" emptySubtitle="На роутере не настроены дополнительные подключения (PPPoE, PPTP, L2TP и т.п.)." />;
}
