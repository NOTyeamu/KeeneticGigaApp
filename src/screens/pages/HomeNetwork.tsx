import { MultiConfigPage } from '../../components/PageParts';

export default function HomeNetwork() {
  return (
    <MultiConfigPage
      emptyHint="Информация о домашней сети недоступна."
      sections={[
        { title: 'DHCP-сервер', keys: [['ip', 'dhcp'], ['dhcp']] },
        { title: 'Домашний Wi-Fi', keys: [['ip', 'hotspot'], ['hotspot']] },
        { title: 'Статические lease', keys: [['static'], ['ip', 'static']] },
        { title: 'LAN-интерфейсы', keys: [['interface'], ['ip', 'interface']] },
      ]}
    />
  );
}
