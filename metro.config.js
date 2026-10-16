const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// На этом ПК 8 ГБ ОЗУ: по умолчанию Metro поднимает воркеров по числу ядер (8),
// и bundling для release-сборки умирает с «JavaScript heap out of memory».
// Два воркера — медленнее на ~минуту, зато сборка стабильно проходит.
config.maxWorkers = 2;

module.exports = config;
