-- Toán Du Ký — Migration 003: Teacher & Admin Direct Student Account Provisioning
-- Allows an active Teacher (for their own/assigned classes) or Admin (for any class)
-- to directly create a student profile bound to a specific class.

create or replace function public.staff_create_student_profile(
  p_target_uid text,
  p_username text,
  p_display_name text,
  p_class_id text,
  p_initial_profile jsonb default '{}'::jsonb
)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_uid text := (select auth.uid())::text;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display text := coalesce(nullif(trim(p_display_name), ''), 'Học viên khám phá');
  v_cls public.classes%rowtype;
  v_count integer;
  v_student_code text;
  v_user public.users%rowtype;
begin
  if v_caller_uid is null or not private.is_staff() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền cấp tài khoản học sinh.';
  end if;

  if p_target_uid is null or trim(p_target_uid) = '' then
    raise exception 'Thiếu UID tài khoản học sinh.';
  end if;

  if char_length(v_username) < 3 or char_length(v_username) > 64 then
    raise exception 'Tên đăng nhập không hợp lệ.';
  end if;

  select * into v_cls
  from public.classes c
  where c.id = p_class_id
  limit 1;

  if not found then
    raise exception 'Không tìm thấy lớp học được chọn.';
  end if;

  -- Teachers can ONLY provision students into their own or assigned classes
  if not private.is_admin() and not private.is_teacher_for_class(v_cls.id, v_cls.teacher_uid) then
    raise exception 'Giáo viên chỉ được cấp tài khoản cho học sinh thuộc lớp mình phụ trách.';
  end if;

  select count(*) + 1 into v_count
  from public.users u
  where u.class_id = v_cls.id and u.role = 'student';

  v_student_code := 'HS-' || v_cls.name || '-' || lpad(v_count::text, 2, '0') || '-' || upper(left(replace(p_target_uid, '-', ''), 4));

  insert into public.users (
    uid, username, role, status, locked, display_name, student_code,
    class_id, class_code, teacher_uid, assigned_class_ids,
    research_consent, is_test_account, avatar_created,
    avatar, xp, awarded_keys, skills, inventory, stations, journey,
    paused_session, recent_question_sessions, leaderboard_opt_in, preferences
  )
  values (
    p_target_uid,
    v_username,
    'student',
    'active',
    false,
    v_display,
    v_student_code,
    v_cls.id,
    v_cls.code,
    v_cls.teacher_uid,
    '{}',
    false,
    false,
    false,
    coalesce(p_initial_profile->'avatar', '{}'::jsonb),
    0,
    '{}',
    coalesce(p_initial_profile->'skills', '{}'::jsonb),
    coalesce(p_initial_profile->'inventory', '{}'::jsonb),
    coalesce(p_initial_profile->'stations', '{}'::jsonb),
    coalesce(p_initial_profile->'journey', '{}'::jsonb),
    null,
    '[]'::jsonb,
    false,
    coalesce(p_initial_profile->'preferences', '{}'::jsonb)
  )
  returning * into v_user;

  return v_user;
end;
$$;

revoke execute on function public.staff_create_student_profile(text, text, text, text, jsonb) from public, anon;
grant execute on function public.staff_create_student_profile(text, text, text, text, jsonb) to authenticated;
