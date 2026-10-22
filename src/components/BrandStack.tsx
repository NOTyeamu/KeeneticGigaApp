import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { FONT } from '../theme/colors';

/**
 * Верхний блок с изображением роутера, надписью и подзаголовком.
 *
 * Вынесен отдельно, чтобы экран входа и экран блокировки выглядели
 * одинаково: это одна и та же «шапка», а не две похожие копии, которые
 * со временем разъедутся.
 */
export function BrandStack({ onInfoPress }: { onInfoPress?: () => void }) {
  const { colors, haptic } = useSettings();

  return (
    <View style={styles.stack}>
      <Image
        source={require('../../assets/keenetic_giga_router_image.png')}
        style={styles.routerImage}
        resizeMode="contain"
      />
      {/* Надпись приподнята и заходит на нижний край картинки роутера. */}
      <Image
        source={require('../../assets/keenetic_giga_text_image.png')}
        style={styles.brandImage}
        resizeMode="contain"
      />
      <View style={styles.subtitleRow}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Управление роутером</Text>
        {onInfoPress ? (
          <Pressable
            onPress={() => {
              haptic(14);
              onInfoPress();
            }}
            hitSlop={10}
            style={styles.infoBtn}
          >
            <Image
              source={require('../../assets/info_icon.png')}
              style={[styles.infoIcon, { tintColor: colors.textSecondary }]}
              resizeMode="contain"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
    width: '100%',
  },
  routerImage: {
    width: 300,
    height: 215,
  },
  brandImage: {
    width: '92%',
    maxWidth: 500,
    aspectRatio: 1280 / 518,
    height: undefined,
    marginTop: -40,
    marginBottom: 0,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  subtitle: {
    fontFamily: FONT.regular,
    fontSize: 14,
  },
  infoBtn: {
    marginLeft: 8,
    padding: 4,
  },
  infoIcon: {
    width: 16,
    height: 16,
    opacity: 0.8,
  },
});