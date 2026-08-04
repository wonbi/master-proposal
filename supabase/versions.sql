-- =====================================================================
-- 제안서 "버전(프리셋)" 기능 — Supabase SQL Editor 에 붙여넣고 RUN. (한 번만)
-- 버전마다 자기 상품 목록 + 표지 문구를 따로 가집니다.
-- 공개 링크: .../?v=<슬러그>  (예: ?v=market, ?v=seller)
-- =====================================================================

create table if not exists public.versions (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  sort_order integer default 0,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.versions enable row level security;
drop policy if exists "versions read"   on public.versions;
create policy "versions read"   on public.versions for select using (true);
drop policy if exists "versions insert" on public.versions;
create policy "versions insert" on public.versions for insert to authenticated with check (true);
drop policy if exists "versions update" on public.versions;
create policy "versions update" on public.versions for update to authenticated using (true) with check (true);
drop policy if exists "versions delete" on public.versions;
create policy "versions delete" on public.versions for delete to authenticated using (true);

-- 상품에 버전 연결 컬럼 추가
alter table public.products add column if not exists version_id uuid;
create index if not exists products_version_idx on public.products (version_id);

-- 기본 버전 1개 생성(처음 한 번만) — 지금 있는 상품들을 여기에 배정
insert into public.versions (slug, name, sort_order, settings)
select 'market', '공동구매 마켓', 1,
  jsonb_build_object(
    'hero_eyebrow','공동구매 마켓 제안서 · B2B 도매',
    'hero_title1','바다에서', 'hero_title2','식탁까지,', 'hero_title3','한 번에 채우다',
    'hero_lead','전체 약 500여 종 취급 품목 중, 공동구매 마켓에 바로 올리기 좋은 1만 원대 수산물을 중심으로 간편식품·생활용품까지 엄선해 공급가와 택배 조건으로 정리했습니다.',
    'company','주식회사 마스터', 'team','외부유통팀', 'manager_name','박원비', 'manager_title','팀장',
    'phone','010-2326-5911', 'email','feellost@naver.com', 'kakao','wonbi123'
  )
where not exists (select 1 from public.versions);

-- 버전 없던 기존 상품을 첫 버전에 배정
update public.products
set version_id = (select id from public.versions order by sort_order limit 1)
where version_id is null;
