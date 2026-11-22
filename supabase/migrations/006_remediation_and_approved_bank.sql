-- 006: Closed-loop Teacher-Approved Remediation Assignments + Enforce Approved-Only Questions via RLS

-- 1. Tighten questions_select RLS so students can ONLY read approved curriculum questions from Supabase
alter policy "questions_select" on public.questions
  using ((select private.is_staff()) or review_status = 'approved');

-- 2. Turn OFF allow_pending_in_test_mode by default in global settings
update public.app_settings
set allow_pending_in_test_mode = false,
    updated_at = now()
where id = 'global';

-- 3. Mark verified starter curriculum questions (BS01 + 48 Chapter III expanded items) as approved
update public.questions
set review_status = 'approved',
    payload = jsonb_set(
      jsonb_set(payload, '{review_status}', '"approved"'::jsonb, true),
      '{reviewedBy}',
      '"curriculum_verified"'::jsonb,
      true
    ),
    updated_at = now()
where review_status = 'pending_teacher_review'
  and (
    id in ('P01','P02','P03','P04','M01','M02','M03','M04','M05','M06','R01','R02','R03','R04','T01','T02')
    or id like 'CH3_%'
  );

-- 4. Create individualized teacher-approved remediation worksheets table
create table if not exists public.remediation_assignments (
  id text primary key,
  student_uid text not null,
  student_code text not null default '',
  student_name text not null default '',
  teacher_uid text not null,
  class_id text not null default 'cls_default',
  title text not null,
  target_error_codes text[] not null default '{}',
  remediation_question_ids text[] not null default '{}',
  verify_question_id text not null,
  teacher_note text not null default '',
  status text not null default 'assigned'
    check (status in ('assigned', 'remediation_done', 'verified_passed')),
  remediation_completed_ids text[] not null default '{}',
  verify_passed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_remediation_student
  on public.remediation_assignments (student_uid, created_at desc);

create index if not exists idx_remediation_teacher_class
  on public.remediation_assignments (class_id, teacher_uid);

alter table public.remediation_assignments enable row level security;

create or replace function private.guard_remediation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := (select auth.uid())::text;
begin
  new.updated_at := now();
  if v_caller is null or private.is_admin() then
    return new;
  end if;
  if private.is_teacher_for_class(old.class_id, old.teacher_uid) then
    return new;
  end if;
  -- Students can ONLY update their own completion progress on an assigned worksheet
  if v_caller = old.student_uid then
    if new.id is distinct from old.id
      or new.student_uid is distinct from old.student_uid
      or new.teacher_uid is distinct from old.teacher_uid
      or new.class_id is distinct from old.class_id
      or new.title is distinct from old.title
      or new.target_error_codes is distinct from old.target_error_codes
      or new.remediation_question_ids is distinct from old.remediation_question_ids
      or new.verify_question_id is distinct from old.verify_question_id
      or new.teacher_note is distinct from old.teacher_note
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Học sinh chỉ được cập nhật tiến độ làm bài trên phiếu bổ trợ được giao.';
    end if;
    return new;
  end if;
  raise exception 'Không đủ quyền cập nhật phiếu bổ trợ.';
end;
$$;

create or replace trigger trg_guard_remediation_update
  before update on public.remediation_assignments
  for each row execute function private.guard_remediation_update();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'remediation_assignments' and policyname = 'remediation_select'
  ) then
    create policy "remediation_select" on public.remediation_assignments
      for select to authenticated
      using (
        student_uid = (select auth.uid())::text
        or (select private.is_admin())
        or (select private.is_teacher_for_class(class_id, teacher_uid))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'remediation_assignments' and policyname = 'remediation_insert'
  ) then
    create policy "remediation_insert" on public.remediation_assignments
      for insert to authenticated
      with check (
        (select private.is_admin())
        or (
          teacher_uid = (select auth.uid())::text
          and (select private.is_teacher_for_class(class_id, teacher_uid))
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'remediation_assignments' and policyname = 'remediation_update'
  ) then
    create policy "remediation_update" on public.remediation_assignments
      for update to authenticated
      using (
        student_uid = (select auth.uid())::text
        or (select private.is_admin())
        or (select private.is_teacher_for_class(class_id, teacher_uid))
      )
      with check (
        student_uid = (select auth.uid())::text
        or (select private.is_admin())
        or (select private.is_teacher_for_class(class_id, teacher_uid))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'remediation_assignments' and policyname = 'remediation_delete'
  ) then
    create policy "remediation_delete" on public.remediation_assignments
      for delete to authenticated
      using (
        (select private.is_admin())
        or (select private.is_teacher_for_class(class_id, teacher_uid))
      );
  end if;
end $$;
