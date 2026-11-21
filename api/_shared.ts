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
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
