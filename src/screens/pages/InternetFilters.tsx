import { ConfigPage } from '../../components/PageParts';

export default function InternetFilters() {
  return (
    <ConfigPage
      keys={[['ip', 'content_filter'], ['content_filter'], ['ip', 'internet_filter'], ['service', 'content_filter'], ['content-filter']]}
      maxDepth={3}
      emptyHint="Информация об интернет-фильтрах недоступна."
    />
  );
}
