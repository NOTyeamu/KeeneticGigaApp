import { ConfigPage } from '../../components/PageParts';

export default function ConnectionPriorities() {
  return (
    <ConfigPage
      keys={[['multipath'], ['priority'], ['ip', 'multiguest'], ['interface'], ['rc', 'multipath']]}
      maxDepth={3}
      emptyHint="Информация о приоритетах подключений недоступна."
    />
  );
}
