# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Commands

- Dev server: `npm start` (then press `a` for Android / scan QR in Expo Go)
- Android build run: `npm run android` (uses native `android/` folder via Gradle)
- Typecheck: `npx tsc --noEmit`
- Production bundle check: `npx expo export --platform android`
- Regenerate native folder after `app.json`/dependency changes: `npx expo prebuild --platform android --clean`
- No lint script is configured.

# Build & device notes

- **Standalone install**: `npm run android:release` builds+installs the release APK with the JS bundle embedded - works without Metro. The red "Unable to load script" screen means a **debug** build could not reach Metro; it is not a release-build problem.
- **Debug on the physical device**: prefer USB - `expo run:android` sets up `adb reverse tcp:8081` automatically. Over Wi-Fi, Windows Firewall must allow inbound TCP 8081 (one-time, admin PowerShell): `New-NetFirewallRule -DisplayName "Metro 8081" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081 -Profile Private`
- If expo prints "Port 8081 is being used by another process / Skipping dev server", kill the stale process first: `Get-NetTCPConnection -LocalPort 8081 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }` - otherwise the freshly installed debug app has no bundler to load from.
- `android/gradle.properties` contains PC-specific performance settings (`org.gradle.priority=low`, `workers.max=4`, `caching=true`, `kotlin.daemon.jvmargs`, `reactNativeArchitectures=arm64-v8a`). `npx expo prebuild --platform android --clean` regenerates `android/` and wipes them - re-apply after prebuild (same for the `lint { checkReleaseBuilds false }` block in `android/app/build.gradle`).
- Native C++ build artifacts accumulate inside `node_modules/*/android/{build,.cxx}` and `android/app/{build,.cxx}` (debug+release x ABIs can exceed 10 GB). Stale variants are safe to delete; `npm run clean:android` clears all of them (next build becomes a full rebuild).

# Workflow

- Expo SDK 57 in **CNG (Continuous Native Generation)** mode: `android/` folder is committed and contains the Gradle build.
- Android Studio: open the `android/` subfolder (not the project root) for Gradle sync.
- To run on a device/emulator from CLI: `npm run android`.
- After changing native config in `app.json` or adding native deps, rerun `npx expo prebuild --platform android --clean` to regenerate the `android/` folder.

# Stack

- Expo SDK 57, React Native 0.86, React 19, TypeScript (strict).
- React Navigation v7 (bottom-tabs, no per-tab headers; screens render own headers).
- Digest Auth via `src/lib/digest.ts`, which calls the native module in `modules/digest-http` (OkHttp + NDW2 challenge-response). The router URL is user-entered on the login screen and stored only on the device.
- Inter font via `@expo-google-fonts/inter` (loaded in `App.tsx`).
- Persistent credentials/settings in AsyncStorage (`src/lib/storage.ts`).

# Structure

- `modules/digest-http/` — local Expo module: NDW2-authenticated HTTP client (Kotlin/OkHttp). Autolinked by Expo during prebuild.
- `src/theme/colors.ts` — dark/light palettes, FONT map, Radius, Spacing.
- `src/context/` — AuthContext, SettingsContext, PageContext.
- `src/data/sections.ts` — the section tree shown on the Home tab, plus `MANAGEMENT_ITEMS` (maintenance pages shown on the Settings tab).
- `src/components/` — Card, Row, SectionCard, ObjectView, ConfigTree, InterfaceListPage, PageParts, FormParts, HiddenValue, etc.
- `src/screens/pages/` — 24 section page components; registry in `src/screens/pages/index.ts`.
- `src/navigation/` — RootNavigator (auth gate) + MainTabs + SettingsStack (own stack for the Settings tab).
- `src/lib/version.ts` — app version and update check against GitHub Releases (public repo, no token).

# Notes

- The router URL is NOT hardcoded. It defaults to a generic `http://my.keenetic.net/rci/` and is entered by the user on the login screen (persisted in AsyncStorage).
- RCI responses vary by firmware; pages render resiliently via `ObjectView`/`ConfigTree` with targeted-key extraction and full-config fallback.
- Add new pages by creating a component in `src/screens/pages/`, registering it in `index.ts`, and adding an entry to `src/data/sections.ts` (or `MANAGEMENT_ITEMS` for maintenance pages).
- Rotate the release signing key via the `ANDROID_KEYSTORE_B64` secret; without it CI generates an ephemeral keystore and updates over an existing install will fail.
