-- 009: Fix R04 missing fixedUnitLabel so mobile students are never blocked by decimal-only keyboards.
update public.questions
set payload = jsonb_set(
      jsonb_set(
        payload,
        '{fixedUnitLabel}',
        '"m"'::jsonb,
        true
      ),
      '{stem_vi}',
      '"Làm tròn khoảng cách $6{,}49\\text{ m}$ đến $0{,}1\\text{ m}$ (đơn vị m)."'::jsonb,
      true
    ),
    updated_at = now()
where id = 'R04';
