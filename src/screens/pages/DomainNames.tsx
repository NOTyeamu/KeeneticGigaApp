import { ConfigPage, EndpointPage } from '../../components/PageParts';
import { Api } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { FONT } from '../../theme/colors';
import { Text, View } from 'react-native';

export default function DomainNames() {
  const { colors } = useSettings();
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary, marginLeft: 4 }}>
        DNS-серверы и статические доменные имена.
      </Text>
      <EndpointPage fetcher={(c) => Api.ipDns(c)} cacheKey="ip-dns" title="DNS" emptyHint="DNS-настройки недоступны." />
      <ConfigPage keys={[['ip', 'dns'], ['dns'], ['ip', 'static', 'dns']]} maxDepth={3} emptyHint="Статические доменные имена не найдены." />
    </View>
  );
}
