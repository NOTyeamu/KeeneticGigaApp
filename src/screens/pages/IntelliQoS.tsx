import { ConfigPage } from '../../components/PageParts';

export default function IntelliQoS() {
  return (
    <ConfigPage
      keys={[['service', 'intelliqos'], ['intelliqos'], ['service', 'qos'], ['qos'], ['intelli-qos']]}
      maxDepth={3}
      emptyHint="Информация о IntelliQoS недоступна."
    />
  );
}
