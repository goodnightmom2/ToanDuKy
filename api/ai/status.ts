import {
  getQuotaStatus,
  jsonResponse,
  resolveLiveModelChain,
  verifyRequestAuth,
} from '../_shared.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const reqMax = Number(url.searchParams.get('maxDaily'));
    const status = getQuotaStatus(Number.isFinite(reqMax) ? reqMax : undefined);

    // Only authenticated Admins receive model & detailed quota telemetry
    const auth = await verifyRequestAuth(request, {requireAdmin: true});
    if (!auth.ok) {
      return jsonResponse({configured: status.configured}, 200);
    }

    const liveChain = status.configured ? await resolveLiveModelChain(undefined, false) : [];
    return jsonResponse(
      {
        ...status,
        model: liveChain[0] || status.model,
        availableModels: liveChain,
      },
      200,
    );
  } catch (err) {
    console.error('[api/ai/status] Error:', err);
    return jsonResponse({error: 'Không thể kiểm tra trạng thái AI.'}, 500);
  }
}
