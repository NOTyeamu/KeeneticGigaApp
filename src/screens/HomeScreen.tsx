import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePage } from '../context/PageContext';
import { useSettings } from '../context/SettingsContext';
import { FONT, Spacing } from '../theme/colors';
import { SECTIONS, ALL_ITEMS, MANAGEMENT_ITEMS, type SubItem } from '../data/sections';
import { SearchBar } from '../components/SearchBar';
import { SectionCard } from '../components/SectionCard';
import { ListButton } from '../components/ListButton';
import { EmptyState } from '../components/States';

const BRAND_ASPECT = 1280 / 518;

export function HomeScreen() {
  const { colors } = useSettings();
  const insets = useSafeAreaInsets();
  const { openPage } = usePage();
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');

  /** Страницы обслуживания живут в «Настройках», остальное — во вкладке «Раздел». */
  const open = (item: SubItem) => {
    if (MANAGEMENT_ITEMS.some((m) => m.id === item.id)) {
      navigation.navigate('Settings', {
        screen: 'SettingsPage',
        params: { title: item.title, page: item.page },
      });
      return;
    }
    openPage({ id: item.id, title: item.title, page: item.page });
    navigation.navigate('Section');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_ITEMS.filter((i) => i.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <Image
          source={require('../../assets/keenetic_giga_text_image.png')}
          style={{ width: '60%', maxWidth: 240, aspectRatio: BRAND_ASPECT, height: undefined, marginBottom: 4 }}
          resizeMode="contain"
        />
        <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, marginTop: 2, marginBottom: 16 }}>
          Центр управления роутером
        </Text>
        <SearchBar value={query} onChangeText={setQuery} />
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 16 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered ? (
          filtered.length > 0 ? (
            <View
              style={{
                gap: 1,
                overflow: 'hidden',
                borderRadius: 16,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
              }}
            >
              {filtered.map((item, i) => (
                <ListButton
                  key={item.id}
                  title={item.title}
                  icon={item.icon}
                  first={i === 0}
                  last={i === filtered.length - 1}
                  onPress={() => open(item)}
                />
              ))}
            </View>
          ) : (
            <EmptyState icon="search-outline" title="Ничего не найдено" subtitle="Попробуйте изменить запрос" />
          )
        ) : (
          <View style={{ gap: Spacing.md }}>
            {SECTIONS.map((s) => (
              <SectionCard key={s.id} section={s} onOpenItem={open} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
