import * as Application from 'expo-application';

/**
 * Сведения о приложении и проверка обновлений через GitHub Releases.
 *
 * Репозиторий публичный: релизы читаются по обычному GET без токена, поэтому
 * никаких секретов в APK не зашито. Лимит GitHub для анонимных запросов —
 * 60 в час, чего с запасом хватает на ручную проверку.
 */

export const APP_REPO = 'NOTyeamu/KeeneticGigaApp';
export const APP_REPO_URL = `https://github.com/${APP_REPO}`;
export const APP_RELEASES_URL = `${APP_REPO_URL}/releases`;

/** Версия установленного приложения (из app.json, попадает в нативный номер). */
export function getAppVersion(): string {
  return Application.nativeApplicationVersion ?? '1.0.0';
}

/** "v1.2.3" | "1.2.3-beta.1" -> [1, 2, 3]. */
function parseVersion(v: string): number[] {
  const clean = String(v).trim().replace(/^v/i, '');
  const core = clean.split('-')[0];
  return core.split('.').map((part) => parseInt(part.replace(/[^0-9].*$/, ''), 10) || 0);
}

/** true, если remote новее local. */
export function isNewerVersion(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i++) {
    const a = r[i] ?? 0;
    const b = l[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  url: string;
  notes: string;
  publishedAt: string | null;
  assetName: string | null;
  assetUrl: string | null;
}

/** Последний опубликованный релиз репозитория (без токена). */
export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const res = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`Не удалось получить список релизов (HTTP ${res.status}).`);
  }
  const json: any = await res.json();
  const tag = String(json?.tag_name ?? '');
  if (!tag) throw new Error('Релизы ещё не опубликованы.');

  const assets: any[] = Array.isArray(json?.assets) ? json.assets : [];
  const apk = assets.find((a) => String(a?.name ?? '').toLowerCase().endsWith('.apk')) ?? null;

  return {
    version: tag.replace(/^v/i, ''),
    tag,
    url: String(json?.html_url ?? APP_RELEASES_URL),
    notes: typeof json?.body === 'string' ? json.body : '',
    publishedAt: json?.published_at ?? null,
    assetName: apk ? String(apk.name) : null,
    assetUrl: apk ? String(apk.browser_download_url ?? '') || null : null,
  };
}

export interface UpdateCheckResult {
  current: string;
  latest: ReleaseInfo;
  hasUpdate: boolean;
}

/** Сравнивает установленную версию с последним релизом. */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const current = getAppVersion();
  const latest = await fetchLatestRelease();
  return { current, latest, hasUpdate: isNewerVersion(latest.version, current) };
}