-- =====================================================================
-- 조회수 집계 — Supabase SQL Editor 에 붙여넣고 RUN. (한 번만)
-- 거래처가 제안서를 열어볼 때마다 기록되고, 관리자 페이지에서만 볼 수 있습니다.
-- =====================================================================

create table if not exists public.page_views (
  id           bigint generated always as identity primary key,
  version_slug text default '',      -- 어떤 버전을 봤는지 (seller / market ...)
  visitor      text default '',      -- 브라우저별 임의 식별자(개인정보 아님, 재방문 구분용)
  referrer     text default '',      -- 어디서 들어왔는지 (카톡/네이버 등)
  viewed_at    timestamptz default now()
);

alter table public.page_views enable row level security;

-- 방문자는 "기록만" 가능 (남의 조회수를 볼 수는 없음)
drop policy if exists "views insert" on public.page_views;
create policy "views insert" on public.page_views
  for insert to anon, authenticated with check (true);

-- 조회 통계는 로그인한 관리자만 열람
drop policy if exists "views read" on public.page_views;
create policy "views read" on public.page_views
  for select to authenticated using (true);

create index if not exists page_views_time_idx on public.page_views (viewed_at desc);
create index if not exists page_views_slug_idx on public.page_views (version_slug);
