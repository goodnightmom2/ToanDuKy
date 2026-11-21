import {createClient, type SupabaseClient} from '@supabase/supabase-js';

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

function readEnvConfig(): SupabasePublicConfig {
  const env = (import.meta as unknown as {env?: Record<string, string | undefined>}).env ?? {};
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  const publishableKey = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_ANON_KEY ??
    ''
  ).trim();
  return {url, publishableKey};
}

export const defaultSupabaseConfig: SupabasePublicConfig = readEnvConfig();

export function isSupabaseConfigValid(
  cfg: Partial<SupabasePublicConfig> | null | undefined,
): cfg is SupabasePublicConfig {
  return Boolean(
    cfg?.url &&
      cfg.url.startsWith('https://') &&
      cfg?.publishableKey &&
      cfg.publishableKey.length >= 20,
  );
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function initSupabaseClient(
  customConfig?: Partial<SupabasePublicConfig> | null,
): SupabaseClient | null {
  const cfg =
    customConfig && isSupabaseConfigValid(customConfig)
      ? customConfig
      : defaultSupabaseConfig;

  if (!isSupabaseConfigValid(cfg)) {
    return null;
  }

  const nextKey = `${cfg.url}::${cfg.publishableKey}`;
  if (cachedClient && cachedKey === nextKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(cfg.url, cfg.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    cachedKey = nextKey;
    return cachedClient;
  } catch (err) {
    console.warn('[Supabase] Không thể khởi tạo SDK, chuyển sang LocalAdapter:', err);
    return null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return cachedClient ?? initSupabaseClient();
}

/**
 * Creates a non-persisting Supabase client used when an Admin registers a new
 * Teacher auth account without overwriting the Admin's active browser session.
 */
export function createEphemeralSupabaseClient(
  customConfig?: Partial<SupabasePublicConfig> | null,
): SupabaseClient | null {
  const cfg =
    customConfig && isSupabaseConfigValid(customConfig)
      ? customConfig
      : defaultSupabaseConfig;
  if (!isSupabaseConfigValid(cfg)) return null;
  return createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `tdk_ephemeral_${Date.now()}`,
    },
  });
}

/**
 * Converts a classroom username (e.g. "hocvien01") to a deterministic email
 * for Supabase Auth Email/Password, or preserves a real email containing '@'.
 */
export function toAuthEmail(usernameOrEmail: string): string {
  const normalized = usernameOrEmail.trim().toLowerCase();
  if (normalized.includes('@')) return normalized;
  return `${normalized}@toanduky.local`;
}

export function fromAuthEmail(email: string | null | undefined): string {
  if (!email) return '';
  const lower = email.toLowerCase();
  if (lower.endsWith('@toanduky.local')) {
    return lower.slice(0, -'@toanduky.local'.length);
  }
  return lower;
}

export async function testSupabaseConnection(
  customConfig?: Partial<SupabasePublicConfig> | null,
): Promise<{ok: boolean; offline: boolean; message: string}> {
  const client = initSupabaseClient(customConfig);
  if (!client) {
    return {
      ok: false,
      offline: true,
      message:
        'Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY. Đang dùng LocalAdapter lưu trên máy này.',
    };
  }
  try {
    const {error} = await client.from('app_setup').select('id').limit(1);
    if (error) {
      return {
        ok: false,
        offline: false,
        message: `Đã kết nối Supabase nhưng chưa đọc được bảng app_setup (${error.message}). Hãy kiểm tra đã chạy migration SQL chưa.`,
      };
    }
    return {
      ok: true,
      offline: false,
      message: 'Kết nối CSDL Supabase (PostgreSQL) thành công!',
    };
  } catch (err) {
    return {
      ok: false,
      offline: true,
      message: `Không kết nối được Supabase (${err instanceof Error ? err.message : 'Lỗi mạng'}).`,
    };
  }
}
