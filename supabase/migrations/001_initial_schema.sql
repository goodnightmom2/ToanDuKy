-- Toán Du Ký — Initial PostgreSQL Schema & Row-Level Security (Supabase)
-- Covers: app_setup, app_settings, classes, class_codes, users, questions,
--         attempts, learning_events, rebuttals, survey_reports
-- Security: Strict RBAC (admin / teacher / student), RLS enabled on all tables,
--           private schema for SECURITY DEFINER helpers, immutable column guard trigger.

-- =============================================================================
-- 1. Private schema for internal RBAC helpers (not exposed by PostgREST)
-- =============================================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- =============================================================================
-- 2. Core Tables
-- =============================================================================

create table if not exists public.app_setup (
  id text primary key default 'setup' check (id = 'setup'),
  initialized boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key default 'global' check (id = 'global'),
  help_after_wrong integer not null default 2 check (help_after_wrong between 1 and 5),
  allow_pending_in_test_mode boolean not null default true,
  ai_enabled boolean not null default true,
  ai_daily_quota_limit integer not null default 50 check (ai_daily_quota_limit between 5 and 500),
  audio_default_on boolean not null default false,
  drive_client_id text,
  drive_api_key text,
  journey_unlock_all_demo boolean not null default false,
  map_background_data_url text check (map_background_data_url is null or char_length(map_background_data_url) <= 1250000),
  map_background_has_baked_labels boolean not null default false,
  map_pin_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id text primary key,
  name text not null check (char_length(name) between 1 and 64),
  code text not null check (char_length(code) between 1 and 40),
  code_expires_at timestamptz,
  teacher_uid text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_codes (
  code text primary key check (char_length(code) between 1 and 40),
  class_id text not null references public.classes(id) on delete cascade,
  class_name text not null check (char_length(class_name) between 1 and 64),
  teacher_uid text not null,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  uid text primary key,
  username text not null unique check (char_length(username) between 3 and 64),
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  status text not null default 'active' check (status in ('active', 'locked')),
  locked boolean not null default false,
  display_name text not null check (char_length(display_name) between 1 and 80),
  real_name_private text,
  student_code text not null check (char_length(student_code) between 1 and 40),
  class_id text not null default 'cls_default',
  class_code text not null default 'TOAN10-01',
  teacher_uid text not null,
  assigned_class_ids text[] not null default '{}',
  research_consent boolean not null default false,
  is_test_account boolean not null default false,
  avatar_created boolean not null default false,
  avatar jsonb not null default '{}'::jsonb,
  xp integer not null default 0 check (xp >= 0 and xp <= 1000000),
  awarded_keys text[] not null default '{}',
  skills jsonb not null default '{}'::jsonb,
  inventory jsonb not null default '{}'::jsonb,
  stations jsonb not null default '{}'::jsonb,
  journey jsonb not null default '{}'::jsonb,
  paused_session jsonb,
  recent_question_sessions jsonb not null default '[]'::jsonb,
  leaderboard_opt_in boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  station_id text,
  stage text,
  cluster text not null check (cluster in ('NEN', 'LG', 'COS', 'SIN', 'DT', 'MH')),
  level integer not null check (level between 1 and 4),
  type text not null,
  review_status text not null default 'pending_teacher_review' check (review_status in ('approved', 'pending_teacher_review', 'rejected')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id text primary key,
  user_id text not null,
  student_code text not null,
  class_id text not null default 'cls_default',
  teacher_uid text not null,
  is_test_account boolean not null default false,
  question_id text not null,
  cluster text not null,
  station_id text,
  moc_id integer,
  mode text not null check (mode in ('practice', 'verify')),
  switched_to_practice boolean not null default false,
  seed integer,
  answer_raw jsonb,
  is_correct boolean not null,
  used_hint boolean not null default false,
  clicked_dont_know boolean not null default false,
  wrong_count_on_question integer not null default 0,
  error_code text,
  duration_ms integer not null default 0,
  rubric_score numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_events (
  event_id text primary key,
  user_id text not null,
  student_code text not null,
  class_id text not null default 'cls_default',
  teacher_uid text not null,
  is_test_account boolean not null default false,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rebuttals (
  id text primary key,
  user_id text not null,
  student_code text not null,
  class_id text not null default 'cls_default',
  teacher_uid text not null,
  display_name text not null,
  question_id text not null,
  question_stem text not null,
  student_answer text not null,
  contested_feedback text not null,
  reasoning text not null check (char_length(reasoning) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'accepted_revision')),
  teacher_reply text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.survey_reports (
  id text primary key,
  user_id text not null,
  student_code text,
  class_id text not null default 'cls_default',
  teacher_uid text not null,
  station_id text not null,
  measured_ab numeric not null,
  measured_angle_a numeric not null,
  measured_angle_b numeric not null,
  computed_angle_c numeric not null,
  computed_ac numeric not null,
  t01_rubric_score numeric,
  t01_explanation text,
  t02_agreed boolean,
  open_survey_note text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 3. Indexes for RLS & Query Performance
-- =============================================================================

create index if not exists classes_teacher_uid_idx on public.classes (teacher_uid);
create index if not exists class_codes_class_id_idx on public.class_codes (class_id);
create index if not exists class_codes_teacher_uid_idx on public.class_codes (teacher_uid);

create index if not exists users_teacher_uid_idx on public.users (teacher_uid);
create index if not exists users_class_id_idx on public.users (class_id);
create index if not exists users_role_idx on public.users (role);

create index if not exists questions_review_status_idx on public.questions (review_status);
create index if not exists questions_station_cluster_idx on public.questions (station_id, cluster);

create index if not exists attempts_user_id_idx on public.attempts (user_id);
create index if not exists attempts_teacher_uid_idx on public.attempts (teacher_uid);
create index if not exists attempts_class_id_idx on public.attempts (class_id);

create index if not exists learning_events_user_id_idx on public.learning_events (user_id);
create index if not exists learning_events_teacher_uid_idx on public.learning_events (teacher_uid);

create index if not exists rebuttals_user_id_idx on public.rebuttals (user_id);
create index if not exists rebuttals_teacher_uid_idx on public.rebuttals (teacher_uid);
create index if not exists rebuttals_status_idx on public.rebuttals (status);

create index if not exists survey_reports_user_id_idx on public.survey_reports (user_id);
create index if not exists survey_reports_teacher_uid_idx on public.survey_reports (teacher_uid);

-- =============================================================================
-- 4. Private RBAC Helper Functions (SECURITY DEFINER, strict auth.uid() checks)
-- =============================================================================

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.uid = (select auth.uid())::text
      and u.role = 'admin'
      and u.status = 'active'
      and u.locked = false
  );
$$;

create or replace function private.is_active_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.uid = (select auth.uid())::text
      and u.role = 'teacher'
      and u.status = 'active'
      and u.locked = false
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.uid = (select auth.uid())::text
      and u.role in ('admin', 'teacher')
      and u.status = 'active'
      and u.locked = false
  );
$$;

create or replace function private.is_teacher_for_class(p_class_id text, p_teacher_uid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.uid = (select auth.uid())::text
      and u.role = 'teacher'
      and u.status = 'active'
      and u.locked = false
      and (
        p_teacher_uid = u.uid
        or (p_class_id is not null and p_class_id = any(u.assigned_class_ids))
      )
  );
$$;

create or replace function private.caller_class_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.class_id
  from public.users u
  where u.uid = (select auth.uid())::text
  limit 1;
$$;

create or replace function private.is_test_mode_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.allow_pending_in_test_mode from public.app_settings s where s.id = 'global'),
    true
  );
$$;

create or replace function private.matches_student_scope(
  p_user_id text,
  p_class_id text,
  p_teacher_uid text,
  p_student_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.uid = (select auth.uid())::text
      and u.status = 'active'
      and u.locked = false
      and p_user_id = u.uid
      and p_class_id = u.class_id
      and p_teacher_uid = u.teacher_uid
      and (p_student_code is null or p_student_code = u.student_code)
  );
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_teacher() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_teacher_for_class(text, text) to authenticated;
grant execute on function private.caller_class_id() to authenticated;
grant execute on function private.is_test_mode_enabled() to authenticated;
grant execute on function private.matches_student_scope(text, text, text, text) to authenticated;

-- =============================================================================
-- 5. Immutable User Column Protection Trigger (prevents privilege escalation)
-- =============================================================================

create or replace function private.guard_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := (select auth.uid())::text;
begin
  new.updated_at := now();

  -- Service/postgres migrations or active admin may modify any field
  if v_caller is null or private.is_admin() then
    return new;
  end if;

  -- Self-update by active non-admin user: protect identity, role, class, status
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
    return new;
  end if;

  -- Assigned teacher may only unlock/reset a student's journey progress
  if private.is_teacher_for_class(old.class_id, old.teacher_uid) then
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
      raise exception 'Giáo viên không được sửa thông tin định danh hoặc vai trò học viên.';
    end if;
    return new;
  end if;

  raise exception 'Không đủ quyền cập nhật hồ sơ người dùng.';
end;
$$;

drop trigger if exists trg_guard_user_update on public.users;
create trigger trg_guard_user_update
  before update on public.users
  for each row
  execute function private.guard_user_update();

-- =============================================================================
-- 6. Safe Public RPCs for Onboarding (First Admin & Class Code Validation)
-- =============================================================================

-- Validate a specific class code without allowing full enumeration of class_codes
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
  if v_code = '' then
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

  return jsonb_build_object(
    'valid', true,
    'expired', false,
    'code', v_row.code,
    'classId', v_row.class_id,
    'className', v_row.class_name,
    'teacherUid', v_row.teacher_uid
  );
end;
$$;

-- Atomic one-time first-admin bootstrap (impossible to run twice)
create or replace function public.bootstrap_first_admin(
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
  v_uid text := (select auth.uid())::text;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display text := coalesce(nullif(trim(p_display_name), ''), 'Quản trị viên');
  v_inserted_setup text;
  v_user public.users%rowtype;
begin
  if v_uid is null then
    raise exception 'Vui lòng xác thực trước khi khởi tạo quản trị viên.';
  end if;

  if char_length(v_username) < 3 or char_length(v_username) > 64 then
    raise exception 'Tên đăng nhập không hợp lệ.';
  end if;

  -- Atomic one-time lock
  insert into public.app_setup (id, initialized)
  values ('setup', true)
  on conflict (id) do nothing
  returning id into v_inserted_setup;

  if v_inserted_setup is null then
    raise exception 'Hệ thống đã có tài khoản quản trị viên đầu tiên.';
  end if;

  insert into public.app_settings (id)
  values ('global')
  on conflict (id) do nothing;

  insert into public.classes (id, name, code, teacher_uid)
  values ('cls_default', 'Toán 10', 'TOAN10-01', v_uid)
  on conflict (id) do update set teacher_uid = excluded.teacher_uid;

  insert into public.class_codes (code, class_id, class_name, teacher_uid, active)
  values ('TOAN10-01', 'cls_default', 'Toán 10', v_uid, true)
  on conflict (code) do update set teacher_uid = excluded.teacher_uid, active = true;

  insert into public.users (
    uid, username, role, status, locked, display_name, student_code,
    class_id, class_code, teacher_uid, assigned_class_ids,
    research_consent, is_test_account, avatar_created,
    avatar, xp, awarded_keys, skills, inventory, stations, journey,
    paused_session, recent_question_sessions, leaderboard_opt_in, preferences
  )
  values (
    v_uid,
    v_username,
    'admin',
    'active',
    false,
    v_display,
    'GV-ADMIN-01',
    'cls_default',
    'TOAN10-01',
    v_uid,
    array['cls_default'],
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

-- Validated student profile registration bound to an active non-expired class code
create or replace function public.register_student_profile(
  p_username text,
  p_display_name text,
  p_class_code text,
  p_research_consent boolean default false,
  p_initial_profile jsonb default '{}'::jsonb
)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display text := coalesce(nullif(trim(p_display_name), ''), 'Học viên khám phá');
  v_code text := upper(trim(coalesce(p_class_code, '')));
  v_cc public.class_codes%rowtype;
  v_count integer;
  v_student_code text;
  v_user public.users%rowtype;
begin
  if v_uid is null then
    raise exception 'Vui lòng xác thực trước khi tạo hồ sơ học viên.';
  end if;

  if char_length(v_username) < 3 or char_length(v_username) > 64 then
    raise exception 'Tên đăng nhập không hợp lệ.';
  end if;

  select * into v_cc
  from public.class_codes cc
  where cc.code = v_code
  limit 1;

  if not found or not v_cc.active then
    raise exception 'Mã lớp "%" không tồn tại hoặc đã ngừng sử dụng.', v_code;
  end if;

  if v_cc.expires_at is not null and v_cc.expires_at < now() then
    raise exception 'Mã lớp "%" đã hết hạn.', v_code;
  end if;

  select count(*) + 1 into v_count
  from public.users u
  where u.class_code = v_cc.code and u.role = 'student';

  v_student_code := 'HS-' || v_cc.class_name || '-' || lpad(v_count::text, 2, '0') || '-' || upper(left(replace(v_uid, '-', ''), 4));

  insert into public.users (
    uid, username, role, status, locked, display_name, student_code,
    class_id, class_code, teacher_uid, assigned_class_ids,
    research_consent, is_test_account, avatar_created,
    avatar, xp, awarded_keys, skills, inventory, stations, journey,
    paused_session, recent_question_sessions, leaderboard_opt_in, preferences
  )
  values (
    v_uid,
    v_username,
    'student',
    'active',
    false,
    v_display,
    v_student_code,
    v_cc.class_id,
    v_cc.code,
    v_cc.teacher_uid,
    '{}',
    coalesce(p_research_consent, false),
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

revoke execute on function public.validate_class_code(text) from public;
grant execute on function public.validate_class_code(text) to anon, authenticated;

revoke execute on function public.bootstrap_first_admin(text, text, jsonb) from public, anon;
grant execute on function public.bootstrap_first_admin(text, text, jsonb) to authenticated;

revoke execute on function public.register_student_profile(text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.register_student_profile(text, text, text, boolean, jsonb) to authenticated;

-- =============================================================================
-- 7. Explicit Table Grants for Supabase Data API (anon / authenticated)
-- =============================================================================

grant select on public.app_setup to anon, authenticated;

grant select, insert, update on public.app_settings to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.class_codes to authenticated;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.attempts to authenticated;
grant select, insert, update, delete on public.learning_events to authenticated;
grant select, insert, update, delete on public.rebuttals to authenticated;
grant select, insert, update, delete on public.survey_reports to authenticated;

-- =============================================================================
-- 8. Row-Level Security (RLS) Policies
-- =============================================================================

alter table public.app_setup enable row level security;
alter table public.app_settings enable row level security;
alter table public.classes enable row level security;
alter table public.class_codes enable row level security;
alter table public.users enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.learning_events enable row level security;
alter table public.rebuttals enable row level security;
alter table public.survey_reports enable row level security;

-- app_setup (read-only status check; writes happen only via bootstrap_first_admin RPC)
create policy app_setup_select on public.app_setup
  for select to anon, authenticated
  using (true);

-- app_settings
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

create policy app_settings_insert on public.app_settings
  for insert to authenticated
  with check ((select private.is_admin()));

create policy app_settings_update on public.app_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- classes
create policy classes_select on public.classes
  for select to authenticated
  using (
    (select private.is_admin())
    or (select private.is_teacher_for_class(id, teacher_uid))
    or id = (select private.caller_class_id())
  );

create policy classes_insert on public.classes
  for insert to authenticated
  with check (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  );

create policy classes_update on public.classes
  for update to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  )
  with check (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  );

create policy classes_delete on public.classes
  for delete to authenticated
  using ((select private.is_admin()));

-- class_codes (staff only; students check codes through validate_class_code RPC)
create policy class_codes_select on public.class_codes
  for select to authenticated
  using ((select private.is_staff()));

create policy class_codes_insert on public.class_codes
  for insert to authenticated
  with check (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  );

create policy class_codes_update on public.class_codes
  for update to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  )
  with check (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  );

create policy class_codes_delete on public.class_codes
  for delete to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_active_teacher()) and teacher_uid = (select auth.uid())::text)
  );

-- users
create policy users_select on public.users
  for select to authenticated
  using (
    uid = (select auth.uid())::text
    or (select private.is_admin())
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy users_insert_admin on public.users
  for insert to authenticated
  with check ((select private.is_admin()));

create policy users_update on public.users
  for update to authenticated
  using (
    (select private.is_admin())
    or (uid = (select auth.uid())::text and status = 'active' and locked = false)
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  )
  with check (
    (select private.is_admin())
    or (uid = (select auth.uid())::text and status = 'active' and locked = false)
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy users_delete on public.users
  for delete to authenticated
  using ((select private.is_admin()));

-- questions
create policy questions_select on public.questions
  for select to authenticated
  using (
    (select private.is_staff())
    or review_status = 'approved'
    or (review_status = 'pending_teacher_review' and (select private.is_test_mode_enabled()))
  );

create policy questions_insert on public.questions
  for insert to authenticated
  with check ((select private.is_staff()));

create policy questions_update on public.questions
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy questions_delete on public.questions
  for delete to authenticated
  using ((select private.is_staff()));

-- attempts
create policy attempts_select on public.attempts
  for select to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())::text
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy attempts_insert on public.attempts
  for insert to authenticated
  with check (
    (select private.is_admin())
    or (select private.matches_student_scope(user_id, class_id, teacher_uid, student_code))
  );

create policy attempts_update on public.attempts
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy attempts_delete on public.attempts
  for delete to authenticated
  using ((select private.is_admin()));

-- learning_events
create policy learning_events_select on public.learning_events
  for select to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())::text
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy learning_events_insert on public.learning_events
  for insert to authenticated
  with check (
    (select private.is_admin())
    or (select private.matches_student_scope(user_id, class_id, teacher_uid, student_code))
  );

create policy learning_events_update on public.learning_events
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy learning_events_delete on public.learning_events
  for delete to authenticated
  using ((select private.is_admin()));

-- rebuttals
create policy rebuttals_select on public.rebuttals
  for select to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())::text
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy rebuttals_insert on public.rebuttals
  for insert to authenticated
  with check (
    status = 'pending'
    and (
      (select private.is_admin())
      or (select private.matches_student_scope(user_id, class_id, teacher_uid, student_code))
    )
  );

create policy rebuttals_update on public.rebuttals
  for update to authenticated
  using (
    (select private.is_admin())
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  )
  with check (
    (select private.is_admin())
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy rebuttals_delete on public.rebuttals
  for delete to authenticated
  using ((select private.is_admin()));

-- survey_reports
create policy survey_reports_select on public.survey_reports
  for select to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())::text
    or (select private.is_teacher_for_class(class_id, teacher_uid))
  );

create policy survey_reports_insert on public.survey_reports
  for insert to authenticated
  with check (
    (select private.is_admin())
    or (select private.matches_student_scope(user_id, class_id, teacher_uid, student_code))
  );

create policy survey_reports_update on public.survey_reports
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy survey_reports_delete on public.survey_reports
  for delete to authenticated
  using ((select private.is_admin()));
