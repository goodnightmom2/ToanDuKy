-- 008: Require Admin approval for all teacher question additions, edits, and replacements.
-- Teachers can only submit or edit their own pending proposals; live approved questions remain untouched until Admin accepts.

create or replace function private.guard_question_write()
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

  if private.is_active_teacher() then
    if tg_op = 'UPDATE' then
      if old.review_status <> 'pending_teacher_review'
        or coalesce(old.payload->>'proposedByUid', '') <> v_caller
      then
        raise exception 'Giáo viên không được sửa trực tiếp câu hỏi đã duyệt; vui lòng gửi đề xuất để Admin chấp nhận.';
      end if;
    end if;

    if new.review_status <> 'pending_teacher_review' then
      raise exception 'Mọi câu hỏi/học liệu do giáo viên thêm hoặc sửa phải ở trạng thái chờ Admin duyệt.';
    end if;

    new.payload := jsonb_set(
      jsonb_set(
        coalesce(new.payload, '{}'::jsonb) - 'reviewedBy' - 'reviewedAt',
        '{review_status}',
        '"pending_teacher_review"'::jsonb,
        true
      ),
      '{proposedByUid}',
      to_jsonb(v_caller),
      true
    );
    return new;
  end if;

  raise exception 'Không đủ quyền chỉnh sửa ngân hàng câu hỏi.';
end;
$$;

create or replace trigger trg_guard_question_write
  before insert or update on public.questions
  for each row execute function private.guard_question_write();

alter policy "questions_insert" on public.questions
  with check (
    (select private.is_admin())
    or (
      (select private.is_active_teacher())
      and review_status = 'pending_teacher_review'
    )
  );

alter policy "questions_update" on public.questions
  using (
    (select private.is_admin())
    or (
      (select private.is_active_teacher())
      and review_status = 'pending_teacher_review'
      and coalesce(payload->>'proposedByUid', '') = (select auth.uid())::text
    )
  )
  with check (
    (select private.is_admin())
    or (
      (select private.is_active_teacher())
      and review_status = 'pending_teacher_review'
      and coalesce(payload->>'proposedByUid', '') = (select auth.uid())::text
    )
  );

alter policy "questions_delete" on public.questions
  using ((select private.is_admin()));
