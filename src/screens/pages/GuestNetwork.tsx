import { MultiConfigPage } from '../../components/PageParts';

export default function GuestNetwork() {
  return (
    <MultiConfigPage
      emptyHint="Информация о гостевой сети недоступна."
      sections={[
        { title: 'Гостевая сеть', keys: [['ip', 'guest'], ['guest'], ['ip', 'hotspot', 'guest']] },
        { title: 'Гостевой Wi-Fi', keys: [['ip', 'hotspot'], ['hotspot']] },
      ]}
    />
  );
}
