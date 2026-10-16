import { requireNativeModule } from 'expo-modules-core';

/** Нативный HTTP-клиент с авторизацией NDW2 (см. android/.../DigestHttpModule.kt). */
export default requireNativeModule('DigestHttp');