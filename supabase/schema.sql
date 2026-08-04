-- =====================================================================
-- 상품 제안서 관리자 — Supabase 설정 스크립트
-- Supabase 대시보드 → 왼쪽 "SQL Editor" → 아래 전체 붙여넣기 → RUN
-- (한 번만 실행하면 됩니다)
-- =====================================================================

-- 1) 상품 테이블
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  category     text not null default 'fish',   -- fish / meal / living
  name         text not null default '',
  warehouse    text default '',
  spec         text default '',
  supply_price integer default 0,
  courier      text default '',
  ship_fee     integer default 0,
  tax          text default '면세',
  image        text default '',
  show         boolean default true,
  sort_order   integer default 0,
  updated_at   timestamptz default now()
);

-- 2) 보안 규칙(RLS) 켜기
alter table public.products enable row level security;

-- 공개 사이트: 누구나 "보기"만 가능
drop policy if exists "public read" on public.products;
create policy "public read" on public.products for select using (true);

-- 관리자(로그인한 사용자): 추가/수정/삭제 가능
drop policy if exists "auth write insert" on public.products;
create policy "auth write insert" on public.products for insert to authenticated with check (true);
drop policy if exists "auth write update" on public.products;
create policy "auth write update" on public.products for update to authenticated using (true) with check (true);
drop policy if exists "auth write delete" on public.products;
create policy "auth write delete" on public.products for delete to authenticated using (true);

-- 3) 사진 저장 공간(Storage 버킷) — 공개 읽기
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "img public read" on storage.objects;
create policy "img public read" on storage.objects for select using (bucket_id = 'product-images');
drop policy if exists "img auth upload" on storage.objects;
create policy "img auth upload" on storage.objects for insert to authenticated with check (bucket_id = 'product-images');
drop policy if exists "img auth update" on storage.objects;
create policy "img auth update" on storage.objects for update to authenticated using (bucket_id = 'product-images');
drop policy if exists "img auth delete" on storage.objects;
create policy "img auth delete" on storage.objects for delete to authenticated using (bucket_id = 'product-images');

-- 4) 초기 상품 24종 (비어 있을 때만 넣음)
insert into public.products (category, name, warehouse, spec, supply_price, courier, ship_fee, tax, image, show, sort_order)
select * from (values
('fish', '대왕 선동 활 쭈꾸미 1kg', '동해', '동해 창고 · 냉동', 11500, '씨제이대한통운', 4000, '면세', 'fish-1.webp', true, 10),
('fish', '국내산 통찜 오징어 1kg', '동해', '동해 창고 · 냉동', 11000, '씨제이대한통운', 4000, '면세', 'fish-2.webp', true, 20),
('fish', '양미리 1kg', '동해', '동해 창고 · 냉동', 9500, '씨제이대한통운', 4000, '면세', 'fish-3.webp', true, 30),
('fish', '전통방식 건갈치 1kg', '군산', '군산 창고 · 진공포장', 13000, '씨제이대한통운', 4000, '면세', 'fish-4.webp', true, 40),
('fish', '반건조 갑오징어 특대 1미', '군산', '군산 창고 · 반건조', 11000, '씨제이대한통운', 4000, '면세', 'fish-5.webp', true, 50),
('fish', '무염 특대 황금 알가자미 3미', '군산', '군산 창고 · 무염', 9500, '씨제이대한통운', 4000, '면세', 'fish-6.webp', true, 60),
('fish', '연안 급냉 대숫게 1kg', '인천', '인천 창고 · 급냉', 10000, '우체국택배', 4000, '면세', 'fish-7.webp', true, 70),
('fish', '연안 생연어 300g', '인천', '인천 창고 · 냉장', 9400, '우체국택배', 4000, '면세', 'fish-8.webp', true, 80),
('fish', '연안 손질 꽃게 1kg', '인천', '인천 창고 · 급냉', 8800, '우체국택배', 4000, '면세', 'fish-9.webp', true, 90),
('meal', '꼬소 새우치즈볼 600g', '하남', '하남 창고 · 냉동', 10000, '롯데택배', 4000, '과세', 'meal-1.webp', true, 100),
('meal', '맛상 새우까스 20장', '하남', '하남 창고 · 냉동', 7500, '롯데택배', 4000, '과세', 'meal-2.webp', true, 110),
('meal', '맛상 소떡소떡 1.3kg', '하남', '하남 창고 · 냉동', 7000, '롯데택배', 4000, '과세', 'meal-3.webp', true, 120),
('meal', '찐 불향 쭈꾸미볶음 300g', '푸카', '푸카 창고 · 냉동 · 오후마감 12시', 7000, '로젠택배', 4000, '과세', 'meal-4.webp', true, 130),
('meal', '양평해장국 600g', '하남', '하남 창고 · 간편국', 2800, '롯데택배', 4000, '면세', 'meal-5.webp', true, 140),
('meal', '맛상 명품 오리주물럭 500g', '하남', '하남 창고 · 냉동', 6000, '롯데택배', 4000, '과세', 'meal-9.webp', true, 150),
('meal', '따끈따끈 소곱창전골 1kg', '김포', '김포 창고 · 밀키트', 8000, '씨제이대한통운', 4000, '과세', 'meal-6.webp', true, 160),
('meal', '꽉찬 오징어까스 1kg', '김포', '김포 창고 · 냉동', 7500, '씨제이대한통운', 4000, '과세', 'meal-7.webp', true, 170),
('meal', '옛날 쑥개떡 12개입', '김포', '김포 창고 · 냉동', 7000, '씨제이대한통운', 4000, '과세', 'meal-8.webp', true, 180),
('living', '찐한국 숨결고체가글 24정', '찐한국', '찐한국 · 구강용품', 3800, '한진택배', 2500, '과세', 'living-1.webp', true, 190),
('living', '찐한국 그냥치약 100g', '찐한국', '찐한국 · 구강용품', 3400, '한진택배', 2500, '과세', 'living-2.webp', true, 200),
('living', '찐한국 손결 핸드워시 300ml', '찐한국', '찐한국 · 세정용품', 3300, '한진택배', 2500, '과세', 'living-3.webp', true, 210),
('living', '찐한국 주방세제 500ml', '찐한국', '찐한국 · 주방용품', 3100, '한진택배', 2500, '과세', 'living-4.webp', true, 220),
('living', '찐한국 고무장갑 그레이', '찐한국', '찐한국 · 주방용품', 3000, '한진택배', 2500, '과세', 'living-5.webp', true, 230),
('living', '찐한국 고무장갑 퍼플', '찐한국', '찐한국 · 주방용품', 3000, '한진택배', 2500, '과세', 'living-6.webp', true, 240)
) as v(category, name, warehouse, spec, supply_price, courier, ship_fee, tax, image, show, sort_order)
where not exists (select 1 from public.products);
