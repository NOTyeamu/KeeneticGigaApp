import { ConfigPage } from '../../components/PageParts';

export default function Firewall() {
  return (
    <ConfigPage
      keys={[['ip', 'firewall'], ['firewall'], ['ip', 'hotspot', 'firewall']]}
      maxDepth={3}
      emptyHint="Информация о межсетевом экране недоступна."
    />
  );
}
