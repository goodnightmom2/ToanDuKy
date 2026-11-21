import {getQuotaStatus, jsonResponse} from '../_shared.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const reqMax = Number(url.searchParams.get('maxDaily'));
    return jsonResponse(getQuotaStatus(Number.isFinite(reqMax) ? reqMax : undefined), 200);
  } catch (err) {
    console.error('[api/ai/status] Error:', err);
    return jsonResponse({error: 'Không thể kiểm tra trạng thái AI.'}, 500);
  }
}
