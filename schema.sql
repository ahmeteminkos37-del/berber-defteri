-- Supabase SQL Editor'a yapıştırıp çalıştır.
-- (Tablolar zaten varsa, en alttaki ALTER bloklarını çalıştır.)

create table if not exists platform (
  id int primary key default 1,
  fee int not null default 499,
  admin_pw text not null default '12345',
  packages jsonb not null default '[{"months":1,"price":0}]',
  credit_packages jsonb not null default '[{"count":1,"price":0}]',
  hair_models jsonb not null default '[]',
  hair_price integer not null default 0,
  referrers jsonb not null default '[]',
  theme jsonb not null default '{"accent":"#12a085","brand":"#14233f"}'
);
insert into platform (id) values (1) on conflict (id) do nothing;

create table if not exists shops (
  id text primary key,
  name text not null,
  username text,
  pw text not null,
  phone text,
  open text not null,
  close text not null,
  step int not null default 15,
  off_days jsonb not null default '[]',
  breaks jsonb not null default '[]',
  staff jsonb not null default '[]',           -- [{id,name,phone,offDays,breaks,sac:{dur},sakal:{dur}}]
  prices jsonb not null default '{}',          -- {sac,sakal,combo}  (combo = ikisi birlikte indirimi)
  closed_days jsonb not null default '[]',     -- tek seferlik kapatılan günler ['YYYY-MM-DD']
  credits integer not null default 3,
  ref_code text not null default '',
  city text not null default '',
  district text not null default '',
  plan text not null default 'free',
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create unique index if not exists idx_username on shops(lower(username));

create table if not exists appointments (
  id bigint generated always as identity primary key,
  shop_id text not null references shops(id) on delete cascade,
  staff_id text not null default '',
  customer_name text not null,
  phone text not null,
  date text not null,
  time text not null,
  dur int not null default 0,                   -- randevu süresi (dk)
  price int not null default 0,                 -- ücret (TL)
  services jsonb not null default '[]',         -- ['sac','sakal']
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_slot on appointments(shop_id, staff_id, date, time);
create index if not exists idx_phone on appointments(shop_id, phone, created_at);

create table if not exists passes (
  shop_id text not null references shops(id) on delete cascade,
  phone text not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, phone)
);

-- ===== Tablolar ZATEN varsa, yeni kolonlar için bunları çalıştır =====
-- alter table shops add column if not exists username text;
-- alter table shops add column if not exists staff jsonb not null default '[]';
-- alter table shops add column if not exists prices jsonb not null default '{}';
-- alter table shops add column if not exists closed_days jsonb not null default '[]';
-- alter table shops add column if not exists plan text not null default 'free';
-- alter table shops add column if not exists expires_at timestamptz;
-- create unique index if not exists idx_username on shops(lower(username));
-- alter table appointments add column if not exists staff_id text not null default '';
-- alter table appointments add column if not exists dur int not null default 0;
-- alter table appointments add column if not exists price int not null default 0;
-- alter table appointments add column if not exists services jsonb not null default '[]';
-- drop index if exists idx_slot;
-- create unique index if not exists idx_slot on appointments(shop_id, staff_id, date, time);

-- Geri bildirim / görüş mesajları
create table if not exists feedback (
  id bigint generated always as identity primary key,
  shop_id text,
  shop_name text,
  message text not null,
  reply text,
  created_at timestamptz not null default now(),
  replied_at timestamptz
);
create index if not exists idx_feedback_shop on feedback(shop_id);

-- alter table platform add column if not exists packages jsonb not null default '[{"months":1,"price":0}]';

-- alter table shops add column if not exists credits integer not null default 3;
-- alter table platform add column if not exists credit_packages jsonb not null default '[{"count":1,"price":0}]';
-- alter table platform add column if not exists hair_models jsonb not null default '[]';
-- alter table platform add column if not exists hair_price integer not null default 0;
-- alter table shops add column if not exists ref_code text not null default '';
-- alter table platform add column if not exists referrers jsonb not null default '[]';
-- alter table shops add column if not exists city text not null default '';
-- alter table shops add column if not exists district text not null default '';
-- alter table platform add column if not exists theme jsonb not null default '{"accent":"#12a085","brand":"#14233f"}';
-- alter table platform add column if not exists style text not null default 'tropical';

-- Konuşmacı komisyon/hak ediş sistemi (her dükkanın aldığı paket + hak ediş ödendi mi)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_months int DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ref_paid boolean DEFAULT false;
-- Not: konuşmacının IBAN + paket-bazlı hak ediş (payouts) bilgileri platform.referrers (jsonb) içinde tutulur, ek kolon gerekmez.

-- İndirim kuponu aç/kapa (genel + dükkân bazında)
ALTER TABLE platform ADD COLUMN IF NOT EXISTS coupon_enabled boolean DEFAULT true;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS coupon_off boolean DEFAULT false;

-- Müşteri "gelmedi" takibi + numara engelleme
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show boolean DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS blocked jsonb DEFAULT '[]'::jsonb;

-- Telefon olmadan "günde 1 randevu" için cihaz tanıma
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS device_id text DEFAULT '';

-- Randevu sonrası Google değerlendirme yönlendirme linki
ALTER TABLE shops ADD COLUMN IF NOT EXISTS google_review text DEFAULT '';

-- Şifre kurtarma için güvenlik sorusu
ALTER TABLE shops ADD COLUMN IF NOT EXISTS sec_q text DEFAULT '';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS sec_a text DEFAULT '';

-- Dükkan açma ekranındaki tanıtım videosu (platform geneli)
ALTER TABLE platform ADD COLUMN IF NOT EXISTS promo_video text DEFAULT '';
ALTER TABLE platform ADD COLUMN IF NOT EXISTS promo_desc text DEFAULT '';

-- Çifte rezervasyon koruması: aynı çalışana aynı gün+saat ikinci kayıt imkânsız olur
CREATE UNIQUE INDEX IF NOT EXISTS uniq_slot ON appointments(shop_id, staff_id, date, time);
