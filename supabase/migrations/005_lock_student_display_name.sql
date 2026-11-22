-- Lock student display_name so students cannot overwrite the real name
-- assigned by their teacher during account provisioning.

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

    -- Prevent students from renaming themselves (keeps teacher-assigned real name intact)
    if old.role = 'student' and new.display_name is distinct from old.display_name then
      raise exception 'Tên học sinh đã được cố định theo danh sách lớp, không thể tự đổi.';
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
