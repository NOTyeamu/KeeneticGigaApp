import { ConfigPage } from '../../components/PageParts';

export default function WifiSystem() {
  return (
    <ConfigPage
      keys={[['wifi_system'], ['mesh'], ['service', 'wifi_system'], ['rc', 'wifi_system'], ['wifi-mesh']]}
      maxDepth={3}
      emptyHint="Информация о Wi-Fi системе (Mesh) недоступна."
    />
  );
}
