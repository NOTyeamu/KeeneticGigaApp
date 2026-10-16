import { InterfaceListPage } from '../../components/InterfaceListPage';
import { filterMobile } from '../../lib/interfaces';

export default function Mobile() {
  return <InterfaceListPage filter={filterMobile()} emptyTitle="Mobile-подключение не найдено" emptySubtitle="На роутере не настроено мобильное подключение (3G/4G/LTE)." />;
}
