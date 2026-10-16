import { ConfigPage, EndpointPage } from '../../components/PageParts';
import { Api } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { FONT } from '../../theme/colors';
import { View } from 'react-native';
import { Text } from 'react-native';

export default function Routing() {
  const { colors } = useSettings();
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary, marginLeft: 4 }}>
        Таблица маршрутизации и конфигурация статических маршрутов.
      </Text>
      <EndpointPage fetcher={(c) => Api.ipRoute(c)} cacheKey="ip-route" title="Таблица маршрутов" emptyHint="Маршруты недоступны." />
      <ConfigPage keys={[['ip', 'route'], ['route']]} maxDepth={3} emptyHint="Статические маршруты не найдены." />
    </View>
  );
}
