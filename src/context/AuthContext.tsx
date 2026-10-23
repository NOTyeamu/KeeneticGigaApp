import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Storage } from '../lib/storage';
import type { Credentials } from '../lib/digest';
import * as Session from '../lib/session';

/**
 * Состояние авторизации.
 *
 * Приложение может находиться в одном из трёх положений:
 *
 *   не вошёл      — нет ни данных, ни сохранённой сессии → экран входа
 *   заперто       — сессия сохранена, но нужен пин или отпечаток
 *   вошёл         — данные в памяти, страницы работают
 *
 * `credentials` заполнены только в последнем случае. Это важно: `useCreds()`
 * бросает исключение при пустых данных, и он используется в тринадцати
 * местах. Поэтому экран блокировки показывается ДО монтирования страниц —
 * тогда ни один из них не увидит пустые данные.
 */

/** Через сколько в фоне сессия запирается заново. */
const LOCK_AFTER_MS = 30_000;

interface AuthContextValue {
  credentials: Credentials | null;
  ready: boolean;
  signIn: (creds: Credentials) => Promise<void>;
  signOut: () => Promise<void>;

  /** Включено ли сохранение сессии (пин-код вместо входа каждый раз). */
  persistenceEnabled: boolean;
  /** Нужно ли ввести пин или отпечаток прямо сейчас. */
  locked: boolean;
  biometricEnabled: boolean;
  /** Есть ли на устройстве настроенный отпечаток, которым можно войти. */
  biometricAvailable: boolean;

  /** Разблокировка пином. false — пин не подошёл. */
  unlock: (pin: string) => Promise<boolean>;
  /** Разблокировка отпечатком. false — отменено или не подошёл. */
  unlockWithBiometrics: () => Promise<boolean>;
  /**
   * Вызывается экраном блокировки сразу после успешного входа. Проверяет,
   * не устарел ли ключ отпечатка, и заводит его заново, если нужно.
   */
  afterUnlock: () => Promise<void>;

  /** Включает сохранение сессии: данные уходят под придуманный пин. */
  enablePersistence: (pin: string) => Promise<void>;
  /** Меняет пин, не требуя пароля роутера. false — старый пин не подошёл. */
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  /** Заводит вход по отпечатку. */
  enrollBiometrics: () => Promise<boolean>;
  disableBiometrics: () => Promise<void>;
  /** Выключает сохранение сессии и выходит из аккаунта. */
  disablePersistence: () => Promise<void>;
  /** Забыли пин: стирает сессию и возвращает на экран входа. */
  forgotPin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [ready, setReady] = useState(false);
  /** Сессия сохранена, но ещё не разблокирована. */
  const [locked, setLocked] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  /**
   * Ключ данных, полученный при разблокировке. Нужен, чтобы сменить пин или
   * завести отпечаток, не спрашивая пароль роутера заново. Держится только
   * в памяти и стирается при запирании.
   */
  const dekRef = useRef<Uint8Array | null>(null);
  /** Момент ухода в фон — от него считается срок до запирания. */
  const backgroundedAt = useRef<number | null>(null);

  // ── Запуск ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Вход больше не запоминается сам по себе: прежний ключ с открытым
      // логином и паролем больше не используется и должен быть убран
      // с устройства, иначе вся защита обходится его чтением.
      await Storage.clearCredentials();

      const saved = await Session.hasSession();
      if (saved) {
        // Данных в памяти нет: их отдадут пин или отпечаток.
        const bio = await Session.isBiometricEnabled();
        setPersistenceEnabled(true);
        setBiometricEnabled(bio);
        setLocked(true);
      }
      setReady(true);
    })();
  }, []);

  // Доступность отпечатка: есть ли сканер и заведён ли он в системе.
  const refreshBiometricAvailability = useCallback(async () => {
    try {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricAvailable(hasHardware && enrolled);
    } catch {
      // Модуль недоступен (например, на веб-платформе) — считаем, что нет.
      setBiometricAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refreshBiometricAvailability();
  }, [ready, refreshBiometricAvailability]);

  /** Запирает: данные уходят из памяти, страницам больше нечего показать. */
  const lock = useCallback(() => {
    dekRef.current = null;
    setCredentials(null);
    setLocked(true);
  }, []);

  // ── Запирание после ухода в фон ────────────────────────────
  // Считаем от 'background', а не от 'inactive': краткие перебивания
  // (шторка, звонок) не должны требовать пин заново.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (!persistenceEnabled) return;

      if (next === 'background') {
        backgroundedAt.current = Date.now();
        return;
      }

      if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since && Date.now() - since >= LOCK_AFTER_MS) {
          lock();
        }
      }
    });
    return () => sub.remove();
  }, [persistenceEnabled, lock]);

  // ── Вход и выход ───────────────────────────────────────────
  const signIn = useCallback(async (creds: Credentials) => {
    // Без сохранения сессии данные живут только в памяти: на диск ничего
    // не кладётся, и при следующем запуске вход придётся повторить.
    setCredentials(creds);
  }, []);

  const signOut = useCallback(async () => {
    await Storage.clearCredentials();
    await Session.wipeSession();
    dekRef.current = null;
    setCredentials(null);
    setPersistenceEnabled(false);
    setBiometricEnabled(false);
    setLocked(false);
  }, []);

  // ── Разблокировка ──────────────────────────────────────────
  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    const dek = await Session.unlockDek(pin);
    if (!dek) return false;

    const creds = await Session.credsFromDek(dek);
    if (!creds) return false;

    dekRef.current = dek;
    setCredentials(creds);
    setLocked(false);
    return true;
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    const result = await Session.unlockDekWithBiometrics();
    if (!result) return false;

    dekRef.current = result.dek;
    setCredentials(result.creds);
    setLocked(false);
    return true;
  }, []);

  /**
   * Проверяет, работает ли ещё вход по отпечатку, и при необходимости
   * заводит его заново.
   *
   * Вызывается, когда DEK уже под рукой — то есть после успешного входа
   * по пину. Отпечаток в системе мог смениться, и тогда системный ключ
   * становится недействительным; перезапись возвращает вход по отпечатку.
   *
   * Палец здесь не спрашивается: спрашивать его сразу после того, как
   * человек только что ввёл пин, было бы и лишним, и навязчивым.
   */
  const refreshBiometricKey = useCallback(async (dek: Uint8Array) => {
    const works = await Session.canUseBiometricKey();
    if (!works) await Session.enableBiometrics(dek);
  }, []);

  /** Вызывается экраном блокировки после успешного входа. */
  const afterUnlock = useCallback(async () => {
    const dek = dekRef.current;
    if (!dek || !biometricEnabled) return;
    await refreshBiometricKey(dek);
  }, [biometricEnabled, refreshBiometricKey]);

  // ── Настройки сессии ───────────────────────────────────────
  const enablePersistence = useCallback(async (pin: string) => {
    if (!credentials) throw new Error('Нет данных для сохранения.');

    // Ключ данных оставляем в памяти: иначе сразу после включения нельзя
    // было бы завести отпечаток, не спрашивая пин второй раз.
    dekRef.current = await Session.saveSession(pin, credentials);
    await Storage.clearCredentials();
    setPersistenceEnabled(true);
    setBiometricEnabled(false);
    setLocked(false);
  }, [credentials]);

  const changePin = useCallback(async (oldPin: string, newPin: string): Promise<boolean> => {
    // Спрашиваем старый пин, а не только сверяем DEK: так смену не сделает
    // тот, кто получил разблокированный телефон без знания пина.
    const dek = await Session.unlockDek(oldPin);
    if (!dek) return false;

    const ok = await Session.changePin(dek, newPin);
    if (ok) dekRef.current = dek;
    return ok;
  }, []);

  const enrollBiometrics = useCallback(async (): Promise<boolean> => {
    const dek = dekRef.current;
    if (!dek) return false;

    const ok = await Session.enableBiometrics(dek);
    if (ok) setBiometricEnabled(true);
    return ok;
  }, []);

  const disableBiometrics = useCallback(async () => {
    await Session.disableBiometrics();
    setBiometricEnabled(false);
  }, []);

  const disablePersistence = useCallback(async () => {
    await Session.wipeSession();
    await Storage.clearCredentials();
    dekRef.current = null;
    setPersistenceEnabled(false);
    setBiometricEnabled(false);
    setLocked(false);
    setCredentials(null);
  }, []);

  const forgotPin = useCallback(async () => {
    await disablePersistence();
  }, [disablePersistence]);

  const value = useMemo<AuthContextValue>(
    () => ({
      credentials,
      ready,
      signIn,
      signOut,
      persistenceEnabled,
      locked,
      biometricEnabled,
      biometricAvailable,
      unlock,
      unlockWithBiometrics,
      afterUnlock,
      enablePersistence,
      changePin,
      enrollBiometrics,
      disableBiometrics,
      disablePersistence,
      forgotPin,
    }),
    [
      credentials,
      ready,
      signIn,
      signOut,
      persistenceEnabled,
      locked,
      biometricEnabled,
      biometricAvailable,
      unlock,
      unlockWithBiometrics,
      afterUnlock,
      enablePersistence,
      changePin,
      enrollBiometrics,
      disableBiometrics,
      disablePersistence,
      forgotPin,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}