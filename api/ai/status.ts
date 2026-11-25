import {
  discoverLiveGeminiModelsDetailed,
  getQuotaStatus,
  jsonResponse,
  resolveApiKeyForCaller,
  resolveLiveModelChain,
  verifyRequestAuth,
} from '../_shared.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const reqMax = Number(url.searchParams.get('maxDaily'));
    const status = getQuotaStatus(Number.isFinite(reqMax) ? reqMax : undefined);

    // Unauthenticated callers only receive non-sensitive system configuration flag
    const auth = await verifyRequestAuth(request, {requireStaff: true});
    if (!auth.ok) {
      return jsonResponse({configured: status.configured}, 200);
    }

    const requiresPersonalKey = auth.caller.role === 'teacher';
    const keyRes = resolveApiKeyForCaller(request, auth.caller);
    if (!keyRes.ok) {
      return jsonResponse(
        {
          configured: false,
          requiresPersonalKey,
          usingPersonalKey: false,
          role: auth.caller.role,
          model: '',
          availableModels: [],
          keyError: keyRes.status === 400 ? keyRes.error : undefined,
          dailyUsed: 0,
          dailyLimit: status.dailyLimit,
          remaining: status.dailyLimit,
          date: status.date,
        },
        200,
      );
    }

    const discovered = await discoverLiveGeminiModelsDetailed(keyRes.apiKey);
    if (discovered.keyError) {
      return jsonResponse(
        {
          configured: false,
          requiresPersonalKey,
          usingPersonalKey: keyRes.usingPersonalKey,
          role: auth.caller.role,
          model: '',
          availableModels: [],
          keyError: discovered.keyError,
          dailyUsed: keyRes.usingPersonalKey ? 0 : status.dailyUsed,
          dailyLimit: status.dailyLimit,
          remaining: keyRes.usingPersonalKey ? status.dailyLimit : status.remaining,
          date: status.date,
        },
        200,
      );
    }

    const liveChain = await resolveLiveModelChain(undefined, false, keyRes.apiKey);
    return jsonResponse(
      {
        configured: true,
        requiresPersonalKey,
        usingPersonalKey: keyRes.usingPersonalKey,
        role: auth.caller.role,
        model: liveChain[0] || status.model,
        availableModels: liveChain,
        dailyUsed: keyRes.usingPersonalKey ? 0 : status.dailyUsed,
        dailyLimit: status.dailyLimit,
        remaining: keyRes.usingPersonalKey ? status.dailyLimit : status.remaining,
        date: status.date,
      },
      200,
    );
  } catch (err) {
    console.error('[api/ai/status] Error:', err);
    return jsonResponse({error: 'Không thể kiểm tra trạng thái AI.'}, 500);
  }
}
