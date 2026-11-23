import {GoogleGenAI} from '@google/genai';

export const AI_MODEL = 'gemini-2.5-flash-lite';
export const AI_HARD_PAGE_MODEL = 'gemini-2.5-pro';
export const AI_FALLBACK_MODEL = 'gemini-2.5-flash';
export const AI_STATIC_FALLBACK_CHAIN: string[] = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.8-flash',
  'gemini-2.0-flash',
  'gemini-4-hydrogen',
];
export const DAILY_QUOTA_DEFAULT = 50;
export const PROMPT_VERSION = 'v2.3';

// In-memory cache of live generateContent models discovered from Google AI Studio for this API key
let cachedDiscoveredModels: {fetchedAt: number; models: string[]} | null = null;
const DISCOVER_TTL_MS = 15 * 60 * 1000;

// In-memory 3-minute cooldown for models currently returning 503 UNAVAILABLE / 429 high-demand
const busyModelCooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 3 * 60 * 1000;

export function markModelTemporarilyUnavailable(modelId: string): void {
  busyModelCooldownUntil.set(modelId, Date.now() + COOLDOWN_MS);
}

export function isModelCoolingDown(modelId: string): boolean {
  const until = busyModelCooldownUntil.get(modelId);
  if (!until) return false;
  if (Date.now() >= until) {
    busyModelCooldownUntil.delete(modelId);
    return false;
  }
  return true;
}

function getModelFamilyBucket(modelId: string): string {
  const low = modelId.toLowerCase();
  if (low.includes('flash-lite')) return 'flash-lite';
  if (low.includes('flash')) return 'flash';
  if (low.includes('hydrogen')) return 'hydrogen';
  if (low.includes('pro')) return 'pro';
  if (low.includes('carbon') || low.includes('argon')) return 'frontier';
  return 'other';
}

function scoreModelForTask(modelId: string, preferHard: boolean): number {
  const low = modelId.toLowerCase();
  let score = 0;

  // Penalize experimental/preview slightly because they frequently return 503 high-demand on free tier
  if (low.includes('-exp')) score -= 35;
  if (low.includes('-preview')) score -= 18;
  if (low.includes('thinking')) score -= 10;

  if (preferHard) {
    // Hard-page ("Pro") mode: prefer stable Pro / Flash / Carbon
    if (low.includes('2.5-pro') || low.includes('3.0-pro') || low.includes('3.1-pro')) score += 120;
    else if (low.includes('pro')) score += 105;
    else if (low.includes('2.5-flash') && !low.includes('lite')) score += 95;
    else if (low.includes('flash') && !low.includes('lite')) score += 90;
    else if (low.includes('carbon') || low.includes('argon')) score += 80;
    else if (low.includes('hydrogen')) score += 70;
    else if (low.includes('flash-lite')) score += 65;
  } else {
    // Standard PDF extraction: prioritize high-availability, generous-quota Flash & Flash-Lite models FIRST
    // so overloaded frontier models (503 UNAVAILABLE) never stall extraction!
    if (low === 'gemini-2.5-flash' || low === 'gemini-3.1-flash-lite') score += 140;
    else if (low === 'gemini-2.5-flash-lite') score += 135;
    else if (low.includes('flash-lite')) score += 125;
    else if (low.includes('flash')) score += 120;
    else if (low.includes('2.5-pro') || low.includes('pro')) score += 85;
    else if (low.includes('hydrogen')) score += 75;
    else if (low.includes('carbon') || low.includes('argon')) score += 60;
    else score += 40;
  }

  // Slight tie-breaker preferring newer minor versions within same tier
  const vm = low.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (vm) {
    const maj = Number(vm[1]);
    const min = Number(vm[2] ?? 0);
    // Keep tie-breaker modest (0..25) so family reliability dominates over raw generation number
    score += Math.min(25, maj * 4 + min);
  }

  return score;
}

/**
 * Dynamically queries Google AI Studio `/v1beta/models` (free, zero quota) to discover the
 * exact live `generateContent`-capable Gemini models available on the configured GEMINI_API_KEY.
 */
export async function discoverLiveGeminiModels(): Promise<string[]> {
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return [];

  if (cachedDiscoveredModels && Date.now() - cachedDiscoveredModels.fetchedAt < DISCOVER_TTL_MS) {
    return cachedDiscoveredModels.models;
  }

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
      {
        method: 'GET',
        headers: {'x-goog-api-key': key},
      },
    );
    if (!resp.ok) {
      console.warn('[api/_shared] /v1beta/models returned HTTP', resp.status);
      return [];
    }
    const json = (await resp.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const rawList = Array.isArray(json.models) ? json.models : [];
    const excluded =
      /(embedding|imagen|veo|tts|audio|robotics|computer-use|aqa|deep-research|nano|live|gemma|learnlm|vision-only|bison|gecko|001$)/i;

    const usable = rawList
      .filter((m) => {
        const methods = m.supportedGenerationMethods ?? [];
        if (!methods.includes('generateContent')) return false;
        const id = (m.name ?? '').replace(/^models\//, '').trim();
        if (!id.toLowerCase().startsWith('gemini-')) return false;
        if (excluded.test(id)) return false;
        return true;
      })
      .map((m) => (m.name ?? '').replace(/^models\//, '').trim());

    if (usable.length > 0) {
      cachedDiscoveredModels = {fetchedAt: Date.now(), models: usable};
    }
    return usable;
  } catch (err) {
    console.warn('[api/_shared] discoverLiveGeminiModels error:', err);
    return [];
  }
}

/**
 * Resolves a DIVERSE, ordered list of up to 8 LIVE Gemini models:
 * - Skips models currently in 3-minute 503/429 cooldown (moves them to the very end)
 * - Interleaves different model families (flash, flash-lite, pro, hydrogen) so a 503 spike
 *   in one family immediately succeeds on another family!
 */
export async function resolveLiveModelChain(
  requestedModel?: string,
  preferHard = false,
): Promise<string[]> {
  const discovered = await discoverLiveGeminiModels();
  const cleanReq = (requestedModel ?? '').trim().replace(/^models\//, '');

  if (discovered.length > 0) {
    const sorted = [...discovered].sort(
      (a, b) => scoreModelForTask(b, preferHard) - scoreModelForTask(a, preferHard),
    );
    const healthy = sorted.filter((m) => !isModelCoolingDown(m));
    const cooling = sorted.filter((m) => isModelCoolingDown(m));

    // Diversify across families: pick top 1 from each bucket first, then remaining healthy
    const diversified: string[] = [];
    const seenBuckets = new Set<string>();
    if (cleanReq && healthy.includes(cleanReq)) {
      diversified.push(cleanReq);
      seenBuckets.add(getModelFamilyBucket(cleanReq));
    }
    for (const m of healthy) {
      const b = getModelFamilyBucket(m);
      if (!diversified.includes(m) && !seenBuckets.has(b)) {
        diversified.push(m);
        seenBuckets.add(b);
      }
    }
    for (const m of healthy) {
      if (!diversified.includes(m)) diversified.push(m);
    }
    for (const m of cooling) {
      if (!diversified.includes(m)) diversified.push(m);
    }
    return diversified.slice(0, 8);
  }

  // Static fallback only if listing `/v1beta/models` failed
  const out: string[] = [];
  for (const m of [cleanReq, ...(preferHard ? [AI_HARD_PAGE_MODEL] : []), ...AI_STATIC_FALLBACK_CHAIN]) {
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

let quotaDate = new Date().toISOString().slice(0, 10);
let dailyUsed = 0;

export function getQuotaStatus(maxDaily?: number): {
  configured: boolean;
  model: string;
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  date: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDate) {
    quotaDate = today;
    dailyUsed = 0;
  }
  const limit =
    typeof maxDaily === 'number' && Number.isFinite(maxDaily) && maxDaily > 0
      ? Math.min(maxDaily, 500)
      : DAILY_QUOTA_DEFAULT;
  const configured = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
  );
  return {
    configured,
    model: AI_MODEL,
    dailyUsed,
    dailyLimit: limit,
    remaining: Math.max(0, limit - dailyUsed),
    date: quotaDate,
  };
}

export function checkAndConsumeQuota(maxDaily?: number): {
  ok: boolean;
  used: number;
  limit: number;
  date: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDate) {
    quotaDate = today;
    dailyUsed = 0;
  }
  const limit =
    typeof maxDaily === 'number' && Number.isFinite(maxDaily) && maxDaily > 0
      ? Math.min(maxDaily, 500)
      : DAILY_QUOTA_DEFAULT;
  if (dailyUsed >= limit) {
    return {ok: false, used: dailyUsed, limit, date: quotaDate};
  }
  dailyUsed += 1;
  return {ok: true, used: dailyUsed, limit, date: quotaDate};
}

export function refundQuota(): {used: number; date: string} {
  if (dailyUsed > 0) dailyUsed -= 1;
  return {used: dailyUsed, date: quotaDate};
}

export function getGenAIClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({apiKey: key});
}

export function fixLatexControlChars(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/\t(?=(?:imes|ext|an|heta|o\b|riangle))/g, '\\t')
    .replace(/\f(?=(?:rac))/g, '\\f')
    .replace(/\r(?=(?:ight|ad|ho))/g, '\\r')
    .replace(/\x08(?=(?:egin|eta|ar))/g, '\\b');
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export interface VerifiedCaller {
  uid: string;
  role: 'admin' | 'teacher' | 'student';
}

/**
 * Verifies the caller's Supabase JWT against Supabase Auth and checks active role in public.users.
 * Uses only the public URL + publishable key and the caller's own JWT (respecting RLS).
 */
export async function verifyRequestAuth(
  request: Request,
  options?: {requireStaff?: boolean; requireAdmin?: boolean},
): Promise<{ok: true; caller: VerifiedCaller} | {ok: false; status: number; error: string}> {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const supabaseKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    ''
  ).trim();

  if (!supabaseUrl || !supabaseKey) {
    return {ok: false, status: 503, error: 'Máy chủ chưa cấu hình xác thực Supabase.'};
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || token.length < 20) {
    return {
      ok: false,
      status: 401,
      error: 'Phiên đăng nhập đã hết hạn hoặc chưa được xác thực. Vui lòng đăng xuất rồi đăng nhập lại.',
    };
  }

  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!authRes.ok) {
      return {ok: false, status: 401, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'};
    }
    const authUser = (await authRes.json()) as {id?: string};
    const uid = authUser?.id;
    if (!uid) {
      return {ok: false, status: 401, error: 'Không xác minh được danh tính người dùng.'};
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/users?uid=eq.${encodeURIComponent(uid)}&select=role,status,locked&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!profileRes.ok) {
      return {ok: false, status: 403, error: 'Không thể kiểm tra phân quyền tài khoản.'};
    }
    const rows = (await profileRes.json()) as Array<{
      role?: string;
      status?: string;
      locked?: boolean;
    }>;
    const profile = rows[0];
    if (!profile || profile.locked || profile.status === 'locked') {
      return {ok: false, status: 403, error: 'Tài khoản đang tạm khóa hoặc chưa hợp lệ.'};
    }

    const role = (profile.role ?? 'student') as VerifiedCaller['role'];
    if (options?.requireAdmin && role !== 'admin') {
      return {
        ok: false,
        status: 403,
        error: 'Chỉ Quản trị viên (Admin) mới có quyền sử dụng chức năng nhập học liệu bằng AI.',
      };
    }
    if (options?.requireStaff && role !== 'admin' && role !== 'teacher') {
      return {
        ok: false,
        status: 403,
        error: 'Chỉ Quản trị viên hoặc Giáo viên mới có quyền thực hiện thao tác này.',
      };
    }

    return {ok: true, caller: {uid, role}};
  } catch (err) {
    console.error('[api/_shared] Auth verification error:', err);
    return {ok: false, status: 503, error: 'Lỗi kết nối dịch vụ xác thực.'};
  }
}
