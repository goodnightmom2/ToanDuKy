-- 011: PDF Import Pipeline, Taxonomy (26 Chapter III patterns), Import Batches, Mission Sets & Audit Logs
-- Backward-compatible extension with strict role-based RLS (student / teacher / admin).

-- 1. Taxonomy catalog (26 default Chapter III patterns, Admin-editable)
create table if not exists public.taxonomy (
  id text primary key,
  topic text not null check (topic in ('NEN', 'LG', 'COS', 'SIN', 'DT', 'MH', 'OUT')),
  name text not null,
  typical_levels integer[] not null default '{1,2}',
  suggested_mocs integer[] not null default '{1}',
  has_solver boolean not null default false,
  solver_hint text not null default '',
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'proposed', 'hidden')),
  proposed_by text,
  proposed_by_uid text,
  merged_into text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.taxonomy enable row level security;

-- 2. Import Batches (per-teacher/admin PDF import state + cache metadata; NEVER stores raw PDF binary or page images)
create table if not exists public.import_batches (
  id text primary key,
  owner_uid text not null,
  owner_name text not null default '',
  file_name text not null,
  file_sha256 text not null default '',
  drive_file_id text,
  total_pages integer not null default 0,
  start_page integer not null default 1,
  end_page integer not null default 1,
  classification_mode text not null default 'web_taxonomy' check (classification_mode in ('web_taxonomy', 'document_patterns')),
  status text not null default 'pending' check (status in ('pending', 'reading', 'extracting', 'reviewing', 'completed', 'cancelled', 'error')),
  ai_calls_used integer not null default 0,
  pages_state jsonb not null default '[]'::jsonb,
  extracted_items jsonb not null default '[]'::jsonb,
  answer_keys jsonb not null default '[]'::jsonb,
  pattern_mappings jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_batches_owner on public.import_batches (owner_uid, updated_at desc);
create index if not exists idx_import_batches_sha on public.import_batches (file_sha256);

alter table public.import_batches enable row level security;

-- 3. Mission Sets (per-milestone/station + optional class_id override, draft/pending/published with versioning)
create table if not exists public.mission_sets (
  id text primary key,
  moc_id integer not null check (moc_id between 1 and 10),
  station_id text not null,
  class_id text not null default 'ALL',
  status text not null default 'draft' check (status in ('draft', 'pending_admin_review', 'published')),
  version integer not null default 1,
  slots jsonb not null default '[]'::jsonb,
  boss_slots jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_by text not null default '',
  created_by_uid text not null default '',
  published_by text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mission_sets_moc_class on public.mission_sets (moc_id, class_id, status);

alter table public.mission_sets enable row level security;

-- 4. Mission Set Version History (for rollback & active-session immutability)
create table if not exists public.mission_set_versions (
  id text primary key,
  mission_set_id text not null,
  moc_id integer not null,
  station_id text not null,
  class_id text not null default 'ALL',
  version integer not null,
  slots jsonb not null default '[]'::jsonb,
  boss_slots jsonb not null default '[]'::jsonb,
  notes text not null default '',
  published_by text not null default '',
  published_at timestamptz not null default now()
);

create index if not exists idx_mission_set_versions_set on public.mission_set_versions (mission_set_id, version desc);

alter table public.mission_set_versions enable row level security;

-- 5. Audit Logs (track taxonomy edits, approvals, mission set edits/publishes)
create table if not exists public.audit_logs (
  id text primary key,
  actor_uid text not null,
  actor_name text not null default '',
  actor_role text not null default 'teacher',
  action text not null,
  entity_type text not null,
  entity_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

-- 6. Guard trigger on mission_sets: teachers may ONLY save draft or pending_admin_review; ONLY admin may publish
create or replace function private.guard_mission_set_write()
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
    if new.status = 'published' then
      raise exception 'Chỉ Quản trị viên (Admin) mới có quyền xuất bản bộ nhiệm vụ cho học sinh.';
    end if;
    if tg_op = 'UPDATE' and old.status = 'published' then
      raise exception 'Giáo viên không được sửa trực tiếp bộ nhiệm vụ đã xuất bản; hãy tạo bản nháp gửi Admin duyệt.';
    end if;
    new.published_by := null;
    new.published_at := null;
    return new;
  end if;

  raise exception 'Không đủ quyền chỉnh sửa bộ nhiệm vụ.';
end;
$$;

create or replace trigger trg_guard_mission_set_write
  before insert or update on public.mission_sets
  for each row execute function private.guard_mission_set_write();

-- 7. Guard trigger on taxonomy: teachers may ONLY insert status='proposed'; ONLY admin may activate/edit/hide
create or replace function private.guard_taxonomy_write()
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

  if private.is_active_teacher() and tg_op = 'INSERT' then
    if new.status <> 'proposed' then
      raise exception 'Giáo viên chỉ được đề xuất dạng mới (trạng thái chờ Admin duyệt).';
    end if;
    new.proposed_by_uid := v_caller;
    return new;
  end if;

  raise exception 'Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa danh mục dạng bài.';
end;
$$;

create or replace trigger trg_guard_taxonomy_write
  before insert or update on public.taxonomy
  for each row execute function private.guard_taxonomy_write();

-- 8. RLS Policies (idempotent creation)
do $$
begin
  -- taxonomy: authenticated can read active (staff reads all); admin full write; teacher can propose new
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='taxonomy' and policyname='taxonomy_select') then
    create policy "taxonomy_select" on public.taxonomy
      for select to authenticated
      using ((select private.is_staff()) or status = 'active');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='taxonomy' and policyname='taxonomy_insert') then
    create policy "taxonomy_insert" on public.taxonomy
      for insert to authenticated
      with check (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and status = 'proposed')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='taxonomy' and policyname='taxonomy_update') then
    create policy "taxonomy_update" on public.taxonomy
      for update to authenticated
      using ((select private.is_admin()))
      with check ((select private.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='taxonomy' and policyname='taxonomy_delete') then
    create policy "taxonomy_delete" on public.taxonomy
      for delete to authenticated
      using ((select private.is_admin()));
  end if;

  -- import_batches: students NEVER read or write; teacher manages ONLY own batches; admin sees/manages all
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_batches' and policyname='import_batches_select') then
    create policy "import_batches_select" on public.import_batches
      for select to authenticated
      using (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and owner_uid = (select auth.uid())::text)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_batches' and policyname='import_batches_insert') then
    create policy "import_batches_insert" on public.import_batches
      for insert to authenticated
      with check (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and owner_uid = (select auth.uid())::text)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_batches' and policyname='import_batches_update') then
    create policy "import_batches_update" on public.import_batches
      for update to authenticated
      using (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and owner_uid = (select auth.uid())::text)
      )
      with check (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and owner_uid = (select auth.uid())::text)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_batches' and policyname='import_batches_delete') then
    create policy "import_batches_delete" on public.import_batches
      for delete to authenticated
      using (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and owner_uid = (select auth.uid())::text)
      );
  end if;

  -- mission_sets: students ONLY read published (for ALL or their own class); staff reads all; teacher writes draft/pending only; admin full
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mission_sets' and policyname='mission_sets_select') then
    create policy "mission_sets_select" on public.mission_sets
      for select to authenticated
      using (
        (select private.is_staff())
        or (
          status = 'published'
          and (class_id = 'ALL' or class_id = (select private.caller_class_id()))
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mission_sets' and policyname='mission_sets_insert') then
    create policy "mission_sets_insert" on public.mission_sets
      for insert to authenticated
      with check (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and status in ('draft', 'pending_admin_review'))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mission_sets' and policyname='mission_sets_update') then
    create policy "mission_sets_update" on public.mission_sets
      for update to authenticated
      using (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and status in ('draft', 'pending_admin_review'))
      )
      with check (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and status in ('draft', 'pending_admin_review'))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mission_sets' and policyname='mission_sets_delete') then
    create policy "mission_sets_delete" on public.mission_sets
      for delete to authenticated
      using ((select private.is_admin()));
  end if;

  -- mission_set_versions: staff reads, admin writes
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mission_set_versions' and policyname='mission_set_versions_select') then
    create policy "mission_set_versions_select" on public.mission_set_versions
      for select to authenticated
      using ((select private.is_staff()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mission_set_versions' and policyname='mission_set_versions_insert') then
    create policy "mission_set_versions_insert" on public.mission_set_versions
      for insert to authenticated
      with check ((select private.is_admin()));
  end if;

  -- audit_logs: admin reads all, teacher reads own, staff inserts own
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_logs_select') then
    create policy "audit_logs_select" on public.audit_logs
      for select to authenticated
      using (
        (select private.is_admin())
        or ((select private.is_active_teacher()) and actor_uid = (select auth.uid())::text)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_logs_insert') then
    create policy "audit_logs_insert" on public.audit_logs
      for insert to authenticated
      with check (
        (select private.is_staff())
        and actor_uid = (select auth.uid())::text
      );
  end if;
end $$;

-- 9. Seed the 26 default Chapter III taxonomy patterns (Appendix A)
insert into public.taxonomy (id, topic, name, typical_levels, suggested_mocs, has_solver, solver_hint, sort_order, status)
values
  ('NEN-01', 'NEN', 'Tổng ba góc, tìm góc còn lại', '{1}', '{1}', true, '180 − A − B', 10, 'active'),
  ('NEN-02', 'NEN', 'Cạnh đối diện góc', '{1}', '{1}', false, 'Xác định đỉnh không nằm trên cạnh', 20, 'active'),
  ('NEN-03', 'NEN', 'Hệ thức tam giác vuông, đổi đơn vị & làm tròn', '{1}', '{1}', true, 'Quy đổi đơn vị / làm tròn chuẩn / tam giác vuông', 30, 'active'),
  ('LG-01', 'LG', 'Giá trị lượng giác góc đặc biệt', '{1,2}', '{2}', true, 'Tra bảng góc đặc biệt 0°–180°', 40, 'active'),
  ('LG-02', 'LG', 'Góc bù: sin(180°−α)=sinα, cos(180°−α)=−cosα', '{2}', '{2}', true, 'Áp dụng quan hệ góc bù', 50, 'active'),
  ('LG-03', 'LG', 'Dấu của giá trị lượng giác, góc tù', '{2}', '{2}', true, 'Xét dấu theo miền 0°–90° và 90°–180°', 60, 'active'),
  ('LG-04', 'LG', 'Hệ thức sin²α+cos²α=1, tan, cot', '{2,3}', '{2}', true, 'Tính giá trị còn lại từ 1 giá trị lượng giác', 70, 'active'),
  ('COS-01', 'COS', 'Cosin: tìm cạnh (hai cạnh + góc xen giữa)', '{2}', '{3}', true, 'a = √(b² + c² − 2bc·cosA)', 80, 'active'),
  ('COS-02', 'COS', 'Cosin: tìm góc (ba cạnh)', '{2,3}', '{4}', true, 'A = arccos((b² + c² − a²)/(2bc))', 90, 'active'),
  ('COS-03', 'COS', 'Nhận dạng tam giác nhọn/vuông/tù', '{3}', '{4}', true, 'So sánh c² với a² + b²', 100, 'active'),
  ('COS-04', 'COS', 'Cosin trong bài toán thực tế (khoảng cách, hướng đi)', '{3}', '{4}', true, 'Áp dụng Định lí Côsin từ givens', 110, 'active'),
  ('SIN-01', 'SIN', 'Sin: tìm cạnh (một cạnh + hai góc)', '{2,3}', '{5}', true, 'b = a·sinB / sinA', 120, 'active'),
  ('SIN-02', 'SIN', 'Sin: tìm góc, biện luận', '{3}', '{5}', true, 'Kiểm miền góc 0° < B < 180° − A', 130, 'active'),
  ('SIN-03', 'SIN', 'Bán kính đường tròn ngoại tiếp R', '{2,3}', '{5}', true, 'R = a / (2·sinA)', 140, 'active'),
  ('MH-01', 'MH', 'Đo khoảng cách không tới được (đường đáy + hai góc)', '{3}', '{6}', true, 'Tính góc thứ ba rồi áp dụng Định lí Sin', 150, 'active'),
  ('MH-03', 'MH', 'Giải tam giác', '{3}', '{6}', true, 'Kết hợp Định lí Côsin & Sin theo dữ kiện', 160, 'active'),
  ('DT-01', 'DT', 'S = ½bc·sinA (hai cạnh + góc xen giữa)', '{2,3}', '{7}', true, '½·b·c·sinA', 170, 'active'),
  ('DT-02', 'DT', 'Công thức Heron', '{3}', '{8}', true, '√[p(p−a)(p−b)(p−c)]', 180, 'active'),
  ('DT-03', 'DT', 'S = pr (bán kính nội tiếp)', '{3,4}', '{8}', true, 'r = S / p', 190, 'active'),
  ('DT-04', 'DT', 'S = abc / (4R)', '{3,4}', '{8}', true, 'R = abc / (4S) hoặc S = abc / (4R)', 200, 'active'),
  ('DT-05', 'DT', 'Diện tích trong bài toán thực tế / chia tam giác', '{3,4}', '{8,9}', true, 'Tính diện tích từ givens', 210, 'active'),
  ('MH-02', 'MH', 'Đo chiều cao bằng hai góc ngắm', '{4}', '{9}', true, 'h = d·sinα·sinβ / sin(β−α)', 220, 'active'),
  ('MH-04', 'MH', 'Chuyển động, hướng, vị trí (tàu, máy bay…)', '{3,4}', '{9}', true, 'Tính khoảng cách từ vận tốc, thời gian & góc', 230, 'active'),
  ('MH-05', 'MH', 'Tìm lỗi sai, phản biện lời giải', '{4}', '{9,10}', false, 'Cần giáo viên thẩm định lập luận', 240, 'active'),
  ('MH-06', 'MH', 'Bài tối ưu / vận dụng cao (góc nhìn, đu quay…)', '{4}', '{10}', false, 'Chưa có bộ giải số tự động — cần giáo viên duyệt', 250, 'active'),
  ('OUT-00', 'OUT', 'Ngoài Chương III (Mệnh đề, tập hợp, BPT…)', '{1}', '{}', false, 'Không đưa vào game Chương III', 999, 'active')
on conflict (id) do nothing;
