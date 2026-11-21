-- Toán Du Ký — Migration 004: Deep Security Hardening
-- 1. Close cross-teacher class_codes leak (teachers can only read their own class codes).
-- 2. Strip internal teacherUid/classId from anonymous validate_class_code() response.
-- 3. Move Google Drive integration config into staff-only public.staff_settings (hidden from students).
-- 4. Anti-tampering guards on users (XP jump & milestone jump limits, teacher field scope) and rebuttals.
-- 5. Verify p_target_uid exists in auth.users inside teacher/student provisioning RPCs.

-- 1. Restrict class_codes SELECT to owning teacher or admin
alter policy class_codes_select on public.class_codes
  using (
    (select private.is_admin())
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

-- 2. Minimize data returned by anonymous class code validation (no UUID/classId leak)
create or replace function public.validate_class_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_row public.class_codes%rowtype;
begin
  if v_code = '' or char_length(v_code) > 40 then
    return jsonb_build_object('valid', false, 'expired', false);
  end if;

  select * into v_row
  from public.class_codes cc
  where cc.code = v_code
  limit 1;

  if not found or not v_row.active then
    return jsonb_build_object('valid', false, 'expired', false);
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return jsonb_build_object('valid', false, 'expired', true);
  end if;

  return jsonb_build_object('valid', true, 'expired', false);
end;
$$;

-- 3. Dedicated staff-only integration settings table (students cannot read Drive keys)
create table if not exists public.staff_settings (
  id text primary key default 'global' check (id = 'global'),
  drive_client_id text,
  drive_api_key text,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.staff_settings to authenticated;
alter table public.staff_settings enable row level security;

create policy staff_settings_select on public.staff_settings
  for select to authenticated
  using ((select private.is_staff()));

create policy staff_settings_insert on public.staff_settings
  for insert to authenticated
  with check ((select private.is_admin()));

create policy staff_settings_update on public.staff_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Migrate any existing Drive settings into staff_settings and clear from student-readable app_settings
insert into public.staff_settings (id, drive_client_id, drive_api_key)
select 'global', drive_client_id, drive_api_key
from public.app_settings
where id = 'global' and (drive_client_id is not null or drive_api_key is not null)
on conflict (id) do update
set drive_client_id = coalesce(excluded.drive_client_id, public.staff_settings.drive_client_id),
    drive_api_key = coalesce(excluded.drive_api_key, public.staff_settings.drive_api_key),
    updated_at = now();

update public.app_settings
set drive_client_id = null,
    drive_api_key = null
where id = 'global';

-- 4a. Harden user update guard with anti-cheat & strict teacher field boundaries
create or replace function private.guard_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := (select auth.uid())::text;
  v_old_passed integer := coalesce(jsonb_array_length(old.journey->'passedMoc'), 0);
  v_new_passed integer := coalesce(jsonb_array_length(new.journey->'passedMoc'), 0);
begin
  new.updated_at := now();

  if v_caller is null or private.is_admin() then
    return new;
  end if;

  if v_caller = old.uid then
    if new.uid is distinct from old.uid
      or new.username is distinct from old.username
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.locked is distinct from old.locked
      or new.class_id is distinct from old.class_id
      or new.class_code is distinct from old.class_code
      or new.student_code is distinct from old.student_code
      or new.is_test_account is distinct from old.is_test_account
      or new.teacher_uid is distinct from old.teacher_uid
      or new.assigned_class_ids is distinct from old.assigned_class_ids
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Không được tự thay đổi quyền, lớp hoặc trạng thái tài khoản.';
    end if;

    -- Prevent client-side XP inflation or skipping multiple milestones in one write
    if new.xp < old.xp or new.xp > old.xp + 250 then
      raise exception 'Thay đổi XP không hợp lệ.';
    end if;

    if v_new_passed < v_old_passed or v_new_passed > v_old_passed + 1 then
      raise exception 'Không được nhảy quá 1 cột mốc trong một lần cập nhật.';
    end if;

    return new;
  end if;

  -- Assigned teacher may ONLY unlock/reset journey or paused_session of their own students
  if old.role = 'student' and private.is_teacher_for_class(old.class_id, old.teacher_uid) then
    if new.uid is distinct from old.uid
      or new.username is distinct from old.username
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.locked is distinct from old.locked
      or new.display_name is distinct from old.display_name
      or new.class_id is distinct from old.class_id
      or new.class_code is distinct from old.class_code
      or new.student_code is distinct from old.student_code
      or new.is_test_account is distinct from old.is_test_account
      or new.teacher_uid is distinct from old.teacher_uid
      or new.assigned_class_ids is distinct from old.assigned_class_ids
      or new.xp is distinct from old.xp
      or new.awarded_keys is distinct from old.awarded_keys
      or new.inventory is distinct from old.inventory
      or new.skills is distinct from old.skills
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Giáo viên chỉ được cập nhật tiến độ hành trình của học sinh lớp mình.';
    end if;
    return new;
  end if;

  raise exception 'Không đủ quyền cập nhật hồ sơ người dùng.';
end;
$$;

-- 4b. Protect immutable rebuttal fields when a teacher replies
create or replace function private.guard_rebuttal_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := (select auth.uid())::text;
begin
  if v_caller is null or private.is_admin() then
    return new;
  end if;

  if private.is_teacher_for_class(old.class_id, old.teacher_uid) then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.student_code is distinct from old.student_code
      or new.class_id is distinct from old.class_id
      or new.teacher_uid is distinct from old.teacher_uid
      or new.display_name is distinct from old.display_name
      or new.question_id is distinct from old.question_id
      or new.question_stem is distinct from old.question_stem
      or new.student_answer is distinct from old.student_answer
      or new.contested_feedback is distinct from old.contested_feedback
      or new.reasoning is distinct from old.reasoning
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Giáo viên chỉ được cập nhật trạng thái và nội dung phản hồi.';
    end if;
    return new;
  end if;

  raise exception 'Không đủ quyền cập nhật phản biện.';
end;
$$;

create or replace trigger trg_guard_rebuttal_update
  before update on public.rebuttals
  for each row
  execute function private.guard_rebuttal_update();

-- 5. Verify p_target_uid exists in auth.users inside provisioning RPCs
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

  if p_target_uid is null or not exists (select 1 from auth.users au where au.id::text = p_target_uid) then
    raise exception 'Tài khoản xác thực giáo viên không tồn tại.';
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

  if p_target_uid is null or not exists (select 1 from auth.users au where au.id::text = p_target_uid) then
    raise exception 'Tài khoản xác thực học sinh không tồn tại.';
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
