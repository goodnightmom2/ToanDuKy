import {jsonResponse, verifyRequestAuth} from '../_shared.ts';

interface BulkStudentInput {
  displayName?: string;
  username?: string;
  password?: string;
}

interface BulkCreateBody {
  classId?: string;
  students?: BulkStudentInput[];
  initialProfile?: Record<string, unknown>;
}

const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

function toAuthEmail(username: string): string {
  const n = username.trim().toLowerCase();
  return n.includes('@') ? n : `${n}@toanduky.local`;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
  }

  let body: BulkCreateBody = {};
  try {
    body = (await request.json()) as BulkCreateBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu JSON không hợp lệ.'}, 400);
  }

  const classId = String(body.classId ?? '').trim();
  const students = Array.isArray(body.students) ? body.students : [];
  if (!classId || students.length === 0) {
    return jsonResponse({error: 'Thiếu mã lớp hoặc danh sách học sinh cần cấp.'}, 400);
  }
  if (students.length > 60) {
    return jsonResponse(
      {error: 'Mỗi lần cấp hàng loạt hỗ trợ tối đa 60 học sinh. Hãy chia nhỏ file nếu lớp đông hơn.'},
      400,
    );
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const anonKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(
      {
        error: 'Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY để cấp tài khoản hàng loạt.',
        needsServerKey: true,
      },
      503,
    );
  }

  // 1. Verify target class exists AND belongs to the calling teacher (via caller's JWT under RLS)
  const callerToken = (request.headers.get('authorization') ?? '').slice(7).trim();
  try {
    const clsRes = await fetch(
      `${supabaseUrl}/rest/v1/classes?id=eq.${encodeURIComponent(classId)}&select=id,name,code,teacher_uid&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${callerToken}`,
        },
      },
    );
    const clsRows = (clsRes.ok ? await clsRes.json() : []) as Array<{
      id: string;
      name: string;
      code: string;
      teacher_uid: string;
    }>;
    const cls = clsRows[0];
    if (!cls) {
      return jsonResponse(
        {error: 'Không tìm thấy lớp học hoặc bạn không có quyền cấp học sinh vào lớp này.'},
        403,
      );
    }
    if (auth.caller.role === 'teacher' && cls.teacher_uid !== auth.caller.uid) {
      return jsonResponse(
        {error: 'Giáo viên chỉ được cấp tài khoản hàng loạt vào lớp mình phụ trách.'},
        403,
      );
    }

    // Count existing students in this class for clean sequential student_code
    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/users?class_id=eq.${encodeURIComponent(cls.id)}&role=eq.student&select=uid`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    const existingClassStudents = (countRes.ok ? await countRes.json() : []) as Array<{uid: string}>;
    const baseSeq = existingClassStudents.length;

    const baseProfile = body.initialProfile ?? {};
    type BulkRowResult = {
      stt: number;
      studentCode: string;
      displayName: string;
      className: string;
      classCode: string;
      username: string;
      password: string;
      status: 'created' | 'failed';
      error?: string;
      userRow?: Record<string, unknown>;
    };

    const processStudent = async (item: BulkStudentInput, i: number): Promise<BulkRowResult> => {
      const displayName = String(item.displayName ?? '').trim();
      const baseUsername = String(item.username ?? '').trim().toLowerCase();
      const password = String(item.password ?? '').trim() || '11111111';

      if (!displayName || displayName.length < 2) {
        return {
          stt: i + 1,
          studentCode: '',
          displayName: displayName || '(Trống)',
          className: cls.name,
          classCode: cls.code,
          username: baseUsername,
          password,
          status: 'failed',
          error: 'Họ tên học sinh trống hoặc quá ngắn.',
        };
      }
      if (!USERNAME_RE.test(baseUsername)) {
        return {
          stt: i + 1,
          studentCode: '',
          displayName,
          className: cls.name,
          classCode: cls.code,
          username: baseUsername,
          password,
          status: 'failed',
          error: 'Tên đăng nhập không hợp lệ (3–24 ký tự a-z, 0-9, . _ -).',
        };
      }
      if (password.length < 8) {
        return {
          stt: i + 1,
          studentCode: '',
          displayName,
          className: cls.name,
          classCode: cls.code,
          username: baseUsername,
          password,
          status: 'failed',
          error: 'Mật khẩu phải tối thiểu 8 ký tự.',
        };
      }

      // Attempt Auth Admin create user (auto-suffixing if username already exists on server)
      let finalUsername = baseUsername;
      let createdUid = '';
      let lastAuthErr = '';

      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          const suffix = String(attempt + 1);
          finalUsername = `${baseUsername.slice(0, 24 - suffix.length)}${suffix}`;
        }
        const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: toAuthEmail(finalUsername),
            password,
            email_confirm: true,
            user_metadata: {display_name: displayName, class_code: cls.code},
          }),
        });
        if (authRes.ok) {
          const authUser = (await authRes.json()) as {id?: string};
          createdUid = authUser.id ?? '';
          break;
        }
        const errBody = await authRes.text();
        lastAuthErr = errBody;
        if (!errBody.toLowerCase().includes('already') && !errBody.toLowerCase().includes('exists')) {
          break;
        }
      }

      if (!createdUid) {
        return {
          stt: i + 1,
          studentCode: '',
          displayName,
          className: cls.name,
          classCode: cls.code,
          username: finalUsername,
          password,
          status: 'failed',
          error: lastAuthErr.slice(0, 120) || 'Không thể tạo tài khoản Auth.',
        };
      }

      const seqNum = baseSeq + i + 1;
      const studentCode = `HS-${cls.name}-${String(seqNum).padStart(2, '0')}`;
      const nowIso = new Date().toISOString();
      const rowPayload = {
        uid: createdUid,
        username: finalUsername,
        role: 'student',
        status: 'active',
        display_name: displayName,
        student_code: studentCode,
        class_id: cls.id,
        class_code: cls.code,
        teacher_uid: cls.teacher_uid,
        assigned_class_ids: [],
        research_consent: true,
        is_test_account: false,
        locked: false,
        avatar_created: false,
        avatar: baseProfile.avatar ?? {},
        xp: 0,
        awarded_keys: [],
        skills: baseProfile.skills ?? {},
        inventory: baseProfile.inventory ?? {},
        stations: baseProfile.stations ?? {},
        journey: baseProfile.journey ?? {},
        paused_session: null,
        recent_question_sessions: [],
        leaderboard_opt_in: false,
        preferences: baseProfile.preferences ?? {
          audioEnabled: false,
          reduceMotion: false,
          easyMove: false,
        },
        created_at: nowIso,
        updated_at: nowIso,
      };

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(rowPayload),
      });

      if (!insertRes.ok) {
        const dbErr = await insertRes.text();
        return {
          stt: i + 1,
          studentCode,
          displayName,
          className: cls.name,
          classCode: cls.code,
          username: finalUsername,
          password,
          status: 'failed',
          error: `Đã tạo Auth nhưng lỗi lưu hồ sơ: ${dbErr.slice(0, 100)}`,
        };
      }

      const insertedArr = (await insertRes.json()) as Array<Record<string, unknown>>;
      return {
        stt: i + 1,
        studentCode,
        displayName,
        className: cls.name,
        classCode: cls.code,
        username: finalUsername,
        password,
        status: 'created',
        userRow: insertedArr[0] ?? rowPayload,
      };
    };

    // Process up to 4 students concurrently to keep latency well under Vercel function limits
    const results: BulkRowResult[] = new Array(students.length);
    const CONCURRENCY = 4;
    for (let start = 0; start < students.length; start += CONCURRENCY) {
      const slice = students.slice(start, start + CONCURRENCY);
      const batchOut = await Promise.all(
        slice.map((item, offset) => processStudent(item, start + offset)),
      );
      for (let j = 0; j < batchOut.length; j++) {
        results[start + j] = batchOut[j];
      }
    }

    const createdCount = results.filter((r) => r.status === 'created').length;
    return jsonResponse({
      ok: true,
      createdCount,
      failedCount: results.length - createdCount,
      results,
    });
  } catch (err) {
    console.error('[api/admin/bulk-create-students] Error:', err);
    return jsonResponse({error: 'Lỗi máy chủ khi cấp tài khoản hàng loạt.'}, 500);
  }
}
