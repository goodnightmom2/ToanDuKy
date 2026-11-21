import {GoogleGenAI} from '@google/genai';

export const AI_MODEL = 'gemini-3.1-flash-lite';
export const AI_FALLBACK_MODEL = 'gemini-4-hydrogen';
export const DAILY_QUOTA_DEFAULT = 50;

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
    return {ok: false, status: 401, error: 'Vui lòng đăng nhập để sử dụng tính năng AI.'};
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
        error: 'Chỉ Quản trị viên hoặc Giáo viên mới có quyền dùng AI trích xuất học liệu.',
      };
    }

    return {ok: true, caller: {uid, role}};
  } catch (err) {
    console.error('[api/_shared] Auth verification error:', err);
    return {ok: false, status: 503, error: 'Lỗi kết nối dịch vụ xác thực.'};
  }
}
