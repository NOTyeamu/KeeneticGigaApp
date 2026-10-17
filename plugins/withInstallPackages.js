const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Разрешает приложению устанавливать APK-обновление.
 *
 * Android требует для этого разрешение REQUEST_INSTALL_PACKAGES; без него
 * системный установщик откажется открывать скачанный файл. Разрешение
 * добавляется плагином, а не правкой папки android/: она генерируется
 * prebuild-ом и любые правки в ней теряются.
 */
function withInstallPackages(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];

    const already = permissions.some(
      (p) => p?.$?.['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES',
    );

    if (!already) {
      permissions.push({
        $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' },
      });
    }

    manifest['uses-permission'] = permissions;
    return cfg;
  });
}

module.exports = withInstallPackages;