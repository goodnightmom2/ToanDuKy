-- 007: Support Teacher/Admin soft-CRUD (lock/rename student, archive class),
-- immutable attempt question versioning, and add verified DT Level-3 + MH Level-3 questions.

-- 1. Soft-archive flag on classes
alter table public.classes
  add column if not exists archived boolean not null default false;

-- 2. Immutable question version & snapshot on attempts
alter table public.attempts
  add column if not exists question_version integer not null default 1,
  add column if not exists question_snapshot text;

-- 3. Allow assigned teacher to fix student display_name or lock/unlock student in their own class
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

    if old.role = 'student' and new.display_name is distinct from old.display_name then
      raise exception 'Tên học sinh đã được cố định theo danh sách lớp, không thể tự đổi.';
    end if;

    if new.xp < old.xp or new.xp > old.xp + 250 then
      raise exception 'Thay đổi XP không hợp lệ.';
    end if;

    if v_new_passed < v_old_passed or v_new_passed > v_old_passed + 1 then
      raise exception 'Không được nhảy quá 1 cột mốc trong một lần cập nhật.';
    end if;

    return new;
  end if;

  -- Assigned teacher may manage journey, paused_session, display_name, and lock/status of their own students
  if old.role = 'student' and private.is_teacher_for_class(old.class_id, old.teacher_uid) then
    if new.uid is distinct from old.uid
      or new.username is distinct from old.username
      or new.role is distinct from old.role
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
      raise exception 'Giáo viên chỉ được cập nhật tên, trạng thái khóa và tiến độ hành trình của học sinh lớp mình.';
    end if;
    return new;
  end if;

  raise exception 'Không đủ quyền cập nhật hồ sơ người dùng.';
end;
$$;

-- 4. Mark sequential BS01 M01-M06 as standalone=false in Supabase questions payload
update public.questions
set payload = jsonb_set(payload, '{standalone}', 'false'::jsonb, true),
    updated_at = now()
where id in ('M01','M02','M03','M04','M05','M06');

-- 5. Upsert 3 verified DT Level-3 questions (KV_DT03..05) + 1 standalone MH Level-3 question (HT_MH02)
insert into public.questions (id, station_id, stage, cluster, level, type, review_status, payload)
values
(
  'KV_DT03', 'KV01', 'core', 'DT', 3, 'numeric', 'approved',
  '{"id":"KV_DT03","stationId":"KV01","stage":"core","cluster":"DT","skill_ids":["area_heron","inradius"],"level":3,"type":"numeric","stem_vi":"Một thửa đất tam giác có ba cạnh $a = 5\\text{ m}, b = 12\\text{ m}, c = 13\\text{ m}$. Tính bán kính đường tròn nội tiếp $r$ của tam giác đó.","expected_answer":{"value":2,"rounded":2,"decimal_places":0,"unit":"m"},"fixedUnitLabel":"m","math_params":{"kind":"inradius_heron","a":5,"b":12,"c":13},"solution_vi":"Nửa chu vi $p = \\frac{5+12+13}{2} = 15\\text{ m}$. Theo Heron: $S = \\sqrt{15\\cdot 10\\cdot 3\\cdot 2} = 30\\text{ m}^2$. Từ $S = pr \\Rightarrow r = \\frac{S}{p} = \\frac{30}{15} = 2\\text{ m}$.","anticipated_error_ids":["E11"],"hints_vi":["Tính nửa chu vi $p = \\frac{a+b+c}{2}$ và diện tích $S$ theo công thức Heron.","Áp dụng công thức $S = pr$ để suy ra $r = \\frac{S}{p}$."],"review_status":"approved","reviewedBy":"curriculum_verified","source_refs":["SGK_KNTT_B6"],"is_adapted":true,"version":1}'::jsonb
),
(
  'KV_DT04', 'KV01', 'core', 'DT', 3, 'numeric', 'approved',
  '{"id":"KV_DT04","stationId":"KV01","stage":"core","cluster":"DT","skill_ids":["area_circumradius"],"level":3,"type":"numeric","stem_vi":"Tam giác $ABC$ có ba cạnh $a = 5\\text{ m}, b = 12\\text{ m}, c = 13\\text{ m}$ và diện tích $S = 30\\text{ m}^2$. Tính bán kính đường tròn ngoại tiếp $R$ theo công thức $S = \\frac{abc}{4R}$.","expected_answer":{"value":6.5,"rounded":6.5,"decimal_places":1,"unit":"m"},"fixedUnitLabel":"m","solution_vi":"Từ $S = \\frac{abc}{4R} \\Rightarrow R = \\frac{abc}{4S} = \\frac{5\\cdot 12\\cdot 13}{4\\cdot 30} = \\frac{780}{120} = 6{,}5\\text{ m}$.","anticipated_error_ids":["E11","E12"],"hints_vi":["Biến đổi công thức $S = \\frac{abc}{4R}$ để rút $R$ theo $a, b, c, S$.","Thay $a=5, b=12, c=13, S=30$ vào biểu thức $R = \\frac{abc}{4S}$."],"review_status":"approved","reviewedBy":"curriculum_verified","source_refs":["SGK_KNTT_B6"],"is_adapted":true,"version":1}'::jsonb
),
(
  'KV_DT05', 'KV01', 'core', 'DT', 3, 'true_false_multi', 'approved',
  '{"id":"KV_DT05","stationId":"KV01","stage":"core","cluster":"DT","skill_ids":["area_heron","inradius","area_circumradius"],"level":3,"type":"true_false_multi","stem_vi":"Cho tam giác $ABC$ có ba cạnh $a = 5\\text{ m}, b = 12\\text{ m}, c = 13\\text{ m}$. Xét tính đúng/sai của các nhận định sau:","statements":[{"id":"a","label":"Nửa chu vi của tam giác là $p = 15\\text{ m}$.","isTrue":true,"errorCode":"E11"},{"id":"b","label":"Diện tích tam giác theo công thức Heron là $S = 30\\text{ m}^2$.","isTrue":true,"errorCode":"E11"},{"id":"c","label":"Bán kính đường tròn nội tiếp là $r = \\frac{S}{p} = 2\\text{ m}$.","isTrue":true,"errorCode":"E11"},{"id":"d","label":"Bán kính đường tròn ngoại tiếp là $R = 13\\text{ m}$.","isTrue":false,"errorCode":"E12"}],"expected_answer":{"statements":{"a":true,"b":true,"c":true,"d":false}},"solution_vi":"(a) Đúng: $p = 15\\text{ m}$. (b) Đúng: $S = 30\\text{ m}^2$. (c) Đúng: $r = 30/15 = 2\\text{ m}$. (d) Sai: $R = \\frac{abc}{4S} = 6{,}5\\text{ m}$ ($13\\text{ m}$ là đường kính $2R$).","anticipated_error_ids":["E11","E12"],"hints_vi":["Kiểm tra nửa chu vi $p = \\frac{a+b+c}{2}$ và diện tích $S$.","Phân biệt đường kính $2R$ với bán kính $R = \\frac{abc}{4S}$."],"review_status":"approved","reviewedBy":"curriculum_verified","source_refs":["SGK_KNTT_B6"],"is_adapted":true,"version":1}'::jsonb
),
(
  'HT_MH02', 'HT01', 'core', 'MH', 3, 'mcq', 'approved',
  '{"id":"HT_MH02","stationId":"HT01","stage":"core","cluster":"MH","skill_ids":["interpretation","sine_law"],"level":3,"type":"mcq","stem_vi":"Khi đo gián tiếp từ hai mốc $A, B$ trên bờ thẳng ($AB = 60\\text{ m}$) tới cọc $C$ bên kia sông với $\\widehat{BAC} = 50^\\circ, \\widehat{ABC} = 60^\\circ$, ta tính được $AC \\approx 55{,}3\\text{ m}$. Khoảng cách vuông góc từ $C$ đến đường bờ thẳng $AB$ là bao nhiêu?","options":[{"id":"a","label":"$h = AC\\cdot\\sin 50^\\circ \\approx 42{,}4\\text{ m}$"},{"id":"b","label":"Chính bằng đoạn ngắm $AC \\approx 55{,}3\\text{ m}$","errorCode":"E08"},{"id":"c","label":"Bằng độ dài đường đáy $AB = 60\\text{ m}$","errorCode":"E08"},{"id":"d","label":"Bằng đoạn $BC \\approx 48{,}9\\text{ m}$","errorCode":"E08"}],"expected_answer":{"choice":"a"},"solution_vi":"Hạ $CH \\perp AB$ thì trong tam giác vuông $AHC$, bề rộng vuông góc là $h = CH = AC\\cdot\\sin 50^\\circ \\approx 42{,}4\\text{ m}$ (nhỏ hơn hai đường xiên $AC \\approx 55{,}3\\text{ m}$ và $BC \\approx 48{,}9\\text{ m}$).","anticipated_error_ids":["E08"],"hints_vi":["Phân biệt đường ngắm xiên $AC$ với đoạn vuông góc $CH \\perp AB$.","Xét tam giác vuông $AHC$ vuông tại $H$ với cạnh huyền $AC$ và góc $\\widehat{A} = 50^\\circ$."],"review_status":"approved","reviewedBy":"curriculum_verified","source_refs":["SGK_KNTT_B6"],"is_adapted":true,"version":1}'::jsonb
)
on conflict (id) do update
set review_status = excluded.review_status,
    payload = excluded.payload,
    updated_at = now();
