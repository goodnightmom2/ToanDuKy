import {GoogleGenAI} from '@google/genai';

export const AI_MODEL = 'gemini-3.1-flash-lite';
export const AI_HARD_PAGE_MODEL = 'gemini-4-carbon';
export const AI_FALLBACK_MODEL = 'gemini-3.8-flash';
export const AI_STATIC_FALLBACK_CHAIN: string[] = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];
export const DAILY_QUOTA_DEFAULT = 50;
export const PROMPT_VERSION = 'v2.2';

// In-memory cache of live generateContent models discovered from Google AI Studio for this API key
let cachedDiscoveredModels: {fetchedAt: number; models: string[]} | null = null;
const DISCOVER_TTL_MS = 15 * 60 * 1000;

function extractVersionScore(modelId: string): number {
  const m = modelId.match(/gemini-(\d+)(?:\.(\d+))?/i);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2] ?? 0);
}

function scoreModelForTask(modelId: string, preferHard: boolean): number {
  const low = modelId.toLowerCase();
  let score = extractVersionScore(low) * 10;
  // Prefer stable GA models slightly over preview/exp unless newer generation
  if (low.includes('exp')) score -= 8;
  if (low.includes('preview')) score -= 3;
  if (low.includes('latest')) score += 4;

  if (preferHard) {
    if (low.includes('pro') || low.includes('carbon') || low.includes('argon') || low.includes('ultra')) {
      score += 60;
    } else if (low.includes('flash') && !low.includes('lite')) {
      score += 30;
    } else if (low.includes('hydrogen') || low.includes('lite')) {
      score += 15;
    }
  } else {
    // Fast, accurate multimodal extraction: flash / flash-lite / hydrogen first
    if (low.includes('flash') && !low.includes('lite')) {
      score += 55;
    } else if (low.includes('flash-lite') || low.includes('hydrogen')) {
      score += 48;
    } else if (low.includes('pro') || low.includes('carbon') || low.includes('argon')) {
      score += 35;
    }
  }
  return score;
}

/**
 * Dynamically queries Google AI Studio `/v1beta/models` (free, zero quota) to discover the
 * exact live `generateContent`-capable Gemini models available on the configured GEMINI_API_KEY.
 * Eliminates 404 model-not-found failures whenever Google rotates or retires model IDs.
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
      /(embedding|imagen|veo|tts|audio|robotics|computer-use|aqa|deep-research|nano|live|gemma|learnlm|vision-only|bison|gecko)/i;

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
 * Resolves an ordered, deduplicated list of LIVE Gemini models to attempt for a request.
 * Only tries `requestedModel` first if it exists in Google's live catalog (preventing wasted 404s).
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
    const out: string[] = [];
    if (cleanReq && discovered.includes(cleanReq)) {
      out.push(cleanReq);
    }
    for (const m of sorted) {
      if (!out.includes(m)) out.push(m);
      if (out.length >= 6) break;
    }
    return out;
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
  options?: {requireStaff?: boolean},
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
