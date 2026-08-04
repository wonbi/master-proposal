-- =====================================================================
-- 카테고리(분류) 관리 — Supabase SQL Editor 에 붙여넣고 RUN. (한 번만)
-- 카테고리를 관리자에서 추가·수정·삭제할 수 있게 합니다. (전역: 모든 버전 공용)
-- 상품의 category 값이 여기 key 와 일치해야 해당 섹션에 표시됩니다.
-- =====================================================================

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,   -- 상품과 연결되는 코드(자동 생성)
  name       text not null,          -- 표시 이름 (예: 신선 수산물)
  mark       text default '',        -- 아이콘 글자 (예: 魚)
  eyebrow    text default '',        -- 섹션 위 작은 영문 (예: SEAFOOD)
  descr      text default '',        -- 카테고리 카드 설명
  meta       text default '',        -- 섹션 헤더 오른쪽 작은 글씨
  accent     text default '#0E8A8F', -- 대표 색 (연한 배경은 자동 계산)
  fit        text default 'cover',   -- 사진 맞춤: cover(꽉 채움) / contain(여백)
  show       boolean default true,   -- 공개 사이트 표시 여부 (숨기기)
  sort_order integer default 0
);

-- 이미 categories 표를 만든 경우에도 표시 컬럼 추가
alter table public.categories add column if not exists show boolean default true;

alter table public.categories enable row level security;
drop policy if exists "categories read"   on public.categories;
create policy "categories read"   on public.categories for select using (true);
drop policy if exists "categories insert" on public.categories;
create policy "categories insert" on public.categories for insert to authenticated with check (true);
drop policy if exists "categories update" on public.categories;
create policy "categories update" on public.categories for update to authenticated using (true) with check (true);
drop policy if exists "categories delete" on public.categories;
create policy "categories delete" on public.categories for delete to authenticated using (true);

-- 기본 카테고리 3개 (없을 때만)
insert into public.categories (key, name, mark, eyebrow, descr, meta, accent, fit, sort_order)
select * from (values
  ('fish',   '신선 수산물', '魚', 'SEAFOOD · 메인 카테고리', '동해·군산·인천 창고에서 1만 원대 대표 품목을 각 3종씩 선별.', '동해 · 군산 · 인천 창고', '#0E8A8F', 'cover',   10),
  ('meal',   '간편식품',   '食', 'CONVENIENCE FOOD',        '탕·전골·튀김 등 회전율 높은 즉석·냉동 품목 (하남·김포).',       '하남 · 김포 · 푸카 창고', '#FF5B39', 'cover',   20),
  ('living', '생활용품',   '生', 'LIVING GOODS',            '찐한국 위생·주방 소모품, 정기 납품에 유리한 저단가 구성.',       '찐한국 · 위생/주방',     '#3BA559', 'contain', 30)
) as v(key, name, mark, eyebrow, descr, meta, accent, fit, sort_order)
where not exists (select 1 from public.categories);
