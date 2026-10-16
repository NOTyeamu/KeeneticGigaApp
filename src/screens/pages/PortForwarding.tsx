import { ConfigPage } from '../../components/PageParts';

export default function PortForwarding() {
  return (
    <ConfigPage
      keys={[
        ['ip', 'nat'],
        ['ip', 'port_forwarding'],
        ['ip', 'static_nat'],
        ['nat'],
        ['ip', 'static'],
      ]}
      maxDepth={3}
      emptyHint="Информация о переадресации портов недоступна."
    />
  );
}
