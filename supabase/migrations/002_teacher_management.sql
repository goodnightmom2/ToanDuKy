-- Toán Du Ký — Migration 002: Strict Teacher-Student Isolation & Admin Teacher Provisioning
-- 1. Tighten public.users RLS so teachers can ONLY view/update student rows in their own classes
--    (never other teachers or admins).
-- 2. Add public.admin_create_teacher_profile RPC so Admin can create teacher accounts directly.

alter policy users_select on public.users
  using (
    uid = (select auth.uid())::text
    or (select private.is_admin())
    or (role = 'student' and (select private.is_teacher_for_class(class_id, teacher_uid)))
  );

alter policy users_update on public.users
  using (
    (select private.is_admin())
    or (uid = (select auth.uid())::text and status = 'active' and locked = false)
    or (role = 'student' and (select private.is_teacher_for_class(class_id, teacher_uid)))
  )
  with check (
    (select private.is_admin())
    or (uid = (select auth.uid())::text and status = 'active' and locked = false)
    or (role = 'student' and (select private.is_teacher_for_class(class_id, teacher_uid)))
  );

create or replace function public.admin_create_teacher_profile(
  p_target_uid text,
  p_username text,
  p_display_name text,
  p_initial_profile jsonb default '{}'::jsonb
)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display text := coalesce(nullif(trim(p_display_name), ''), 'Giáo viên Toán');
  v_count integer;
  v_teacher_code text;
  v_user public.users%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền tạo tài khoản giáo viên.';
  end if;

  if p_target_uid is null or trim(p_target_uid) = '' then
    raise exception 'Thiếu UID tài khoản giáo viên.';
  end if;

  if char_length(v_username) < 3 or char_length(v_username) > 64 then
    raise exception 'Tên đăng nhập không hợp lệ.';
  end if;

  select count(*) + 1 into v_count
  from public.users u
  where u.role = 'teacher';

  v_teacher_code := 'GV-' || lpad(v_count::text, 2, '0') || '-' || upper(left(replace(p_target_uid, '-', ''), 4));

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
    'teacher',
    'active',
    false,
    v_display,
    v_teacher_code,
    'cls_teacher',
    'GIAO-VIEN',
    p_target_uid,
    '{}',
    false,
    false,
    true,
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

revoke execute on function public.admin_create_teacher_profile(text, text, text, jsonb) from public, anon;
grant execute on function public.admin_create_teacher_profile(text, text, text, jsonb) to authenticated;
