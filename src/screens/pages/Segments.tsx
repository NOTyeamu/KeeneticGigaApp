import { ConfigPage } from '../../components/PageParts';

export default function Segments() {
  return (
    <ConfigPage
      keys={[['ip', 'segment'], ['segment'], ['policy'], ['ip', 'policy']]}
      maxDepth={3}
      emptyHint="Информация о сегментах сети недоступна."
    />
  );
}
