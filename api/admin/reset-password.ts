import {jsonResponse, verifyRequestAuth} from '../_shared.ts';

interface ResetPasswordBody {
  targetUid?: string;
  newPassword?: string;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
  }

  let body: ResetPasswordBody = {};
  try {
    body = (await request.json()) as ResetPasswordBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu JSON không hợp lệ.'}, 400);
  }

  const targetUid = String(body.targetUid ?? '').trim();
  const newPassword = String(body.newPassword ?? '');
  if (!targetUid || newPassword.length < 8) {
    return jsonResponse(
      {error: 'Thiếu mã người dùng hoặc mật khẩu mới chưa đủ 8 ký tự.'},
      400,
    );
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        error:
          'Máy chủ chưa nạp SUPABASE_SERVICE_ROLE_KEY (biến bí mật phía server trên Vercel) để đặt lại mật khẩu tự động. Quản trị viên có thể nạp biến này trên Vercel hoặc đặt lại trực tiếp trong Supabase Dashboard → Authentication → Users.',
        needsServerKey: true,
      },
      503,
    );
  }

  // Verify caller can actually read target user under RLS (ensures teachers can only reset their own class students)
  const callerToken = (request.headers.get('authorization') ?? '').slice(7).trim();
  const anonKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim();
  try {
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/users?uid=eq.${encodeURIComponent(targetUid)}&select=uid,role&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${callerToken}`,
        },
      },
    );
    const rows = (checkRes.ok ? await checkRes.json() : []) as Array<{uid?: string; role?: string}>;
    const target = rows[0];
    if (!target) {
      return jsonResponse(
        {error: 'Bạn không có quyền đặt lại mật khẩu cho tài khoản này.'},
        403,
      );
    }
    if (auth.caller.role === 'teacher' && target.role !== 'student') {
      return jsonResponse(
        {error: 'Giáo viên chỉ được đặt lại mật khẩu cho học sinh lớp mình.'},
        403,
      );
    }

    const adminRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(targetUid)}`,
      {
        method: 'PUT',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({password: newPassword}),
      },
    );
    if (!adminRes.ok) {
      const errText = await adminRes.text();
      return jsonResponse(
        {error: `Không đặt lại được mật khẩu (${adminRes.status}): ${errText.slice(0, 140)}`},
        502,
      );
    }

    return jsonResponse({ok: true, message: 'Đã đặt lại mật khẩu thành công trên Supabase Auth.'});
  } catch (err) {
    console.error('[api/admin/reset-password] Error:', err);
    return jsonResponse({error: 'Lỗi máy chủ khi đặt lại mật khẩu.'}, 500);
  }
}
