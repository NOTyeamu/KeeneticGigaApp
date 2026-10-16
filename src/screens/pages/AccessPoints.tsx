import { ConfigPage } from '../../components/PageParts';

export default function AccessPoints() {
  return (
    <ConfigPage
      keys={[['wifi_system', 'nodes'], ['access_point'], ['access_points'], ['wifi_system'], ['ap']]}
      maxDepth={3}
      emptyHint="Информация о точках доступа недоступна."
    />
  );
}
