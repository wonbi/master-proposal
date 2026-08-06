-- =====================================================================
-- 계정별 독립 작업공간 — Supabase SQL Editor 에 붙여넣고 RUN. (한 번만)
--
-- 이 스크립트를 실행하면:
--  · 계정마다 자기 버전·상품·카테고리만 보이고 편집할 수 있습니다
--  · 기존 데이터는 "가장 먼저 만든 계정"(=대표 관리자) 소유가 됩니다
--  · 공개 사이트는 그대로 — 링크(?v=)만 있으면 누구나 볼 수 있습니다
-- =====================================================================

-- 1) 소유자 컬럼 추가
alter table public.versions   add column if not exists owner_id uuid;
alter table public.products   add column if not exists owner_id uuid;
alter table public.categories add column if not exists owner_id uuid;

create index if not exists versions_owner_idx   on public.versions (owner_id);
create index if not exists products_owner_idx   on public.products (owner_id);
create index if not exists categories_owner_idx on public.categories (owner_id);

-- 2) 기존 데이터를 가장 먼저 가입한 계정(대표 관리자)에게 배정
update public.versions   set owner_id = (select id from auth.users order by created_at limit 1) where owner_id is null;
update public.products   set owner_id = (select id from auth.users order by created_at limit 1) where owner_id is null;
update public.categories set owner_id = (select id from auth.users order by created_at limit 1) where owner_id is null;

-- 3) 새로 만드는 행은 자동으로 만든 사람 소유가 되도록
alter table public.versions   alter column owner_id set default auth.uid();
alter table public.products   alter column owner_id set default auth.uid();
alter table public.categories alter column owner_id set default auth.uid();

-- =====================================================================
-- 4) 보안 규칙 — 읽기는 공개(공개 사이트용), 쓰기는 본인 것만
-- =====================================================================

-- versions
drop policy if exists "versions read"   on public.versions;
drop policy if exists "versions insert" on public.versions;
drop policy if exists "versions update" on public.versions;
drop policy if exists "versions delete" on public.versions;
create policy "versions read"   on public.versions for select using (true);
create policy "versions insert" on public.versions for insert to authenticated with check (owner_id = auth.uid());
create policy "versions update" on public.versions for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "versions delete" on public.versions for delete to authenticated using (owner_id = auth.uid());

-- products
drop policy if exists "public read"       on public.products;
drop policy if exists "auth write insert" on public.products;
drop policy if exists "auth write update" on public.products;
drop policy if exists "auth write delete" on public.products;
create policy "public read"       on public.products for select using (true);
create policy "auth write insert" on public.products for insert to authenticated with check (owner_id = auth.uid());
create policy "auth write update" on public.products for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "auth write delete" on public.products for delete to authenticated using (owner_id = auth.uid());

-- categories
drop policy if exists "categories read"   on public.categories;
drop policy if exists "categories insert" on public.categories;
drop policy if exists "categories update" on public.categories;
drop policy if exists "categories delete" on public.categories;
create policy "categories read"   on public.categories for select using (true);
create policy "categories insert" on public.categories for insert to authenticated with check (owner_id = auth.uid());
create policy "categories update" on public.categories for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "categories delete" on public.categories for delete to authenticated using (owner_id = auth.uid());

-- 5) 슬러그는 전체에서 유일해야 하므로(주소 충돌 방지) 기존 제약 유지.
--    다른 계정이 이미 쓰는 주소면 자동으로 뒤에 번호가 붙습니다.
