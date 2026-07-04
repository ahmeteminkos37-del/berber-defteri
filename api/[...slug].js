// api/[...slug].js — Sıra Sende API (Vercel serverless + Supabase)
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);
const SECRET = process.env.TOKEN_SECRET || (process.env.SUPABASE_SERVICE_KEY || 'gizli').slice(0, 32);
const PAYMENT = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();
const SHOPIER_PAY_URL = process.env.SHOPIER_PAY_URL || '';
const SHOPIER_CALLBACK_SECRET = process.env.SHOPIER_CALLBACK_SECRET || '';
const GRAN = 15; // boş saat sunumunda temel adım (dk). Randevular gerçek süresini kaplar.
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 3);   // yeni dükkana deneme süresi
const PLAN_DAYS = Number(process.env.PLAN_DAYS || 30);    // her ödeme/yenileme kaç gün ekler
const HAIR_GIFT = Number(process.env.HAIR_GIFT || 3);    // açılışta hediye saç-deneme kredisi
const HAIR_BASE_PROMPT = 'Photorealistic close-up portrait of the SAME man as in the input photo, with ONLY his hairstyle changed to: {CUT}. CRITICAL: keep his exact face, identity, facial features, skin tone, age, expression, beard/stubble, eyes, ears and head angle 100% identical and unchanged; keep the same background, lighting, camera angle and image quality. The new haircut MUST be a realistic barber cut achievable on his CURRENT hair in one salon visit — you may only CUT or restyle the hair he already has. NEVER make the hair longer, NEVER add length, density, extra hair fibers, extensions, wigs or a fake hairline; respect his natural hairline and any recession. Realistic hair texture with clean barber edges. Output only the edited photo with the same framing.';
const DEFAULT_HAIR_MODELS = [
  { id: 'buzz', name: 'Asker Tıraşı', prompt: 'a uniform short buzz cut, clipped to the same very short length all over (around grade 1-2), clean and even, no fade' },
  { id: 'lowfade', name: 'Düşük Fade', prompt: 'a low fade haircut: short textured hair on top, the sides and back kept fuller and only tapering down to the skin low near the bottom, clean low fade line' },
  { id: 'highfade', name: 'Yüksek Fade', prompt: 'a high fade haircut: the sides and back faded to skin high up near the temples, with clearly longer textured hair left on top for strong contrast' },
  { id: 'skinfade', name: 'Cilt Fade', prompt: 'a skin (bald) fade: the sides and back blended all the way down to bare skin, graduating smoothly up into short neat hair on top' },
  { id: 'taper', name: 'Klasik Taper', prompt: 'a classic taper haircut: natural medium length kept on top, sides and neckline gently tapered shorter, tidy and conservative, no exposed skin' },
  { id: 'undercut', name: 'Undercut', prompt: 'a disconnected undercut: the sides and back cut to one short uniform length with a hard disconnection, and the existing top combed/slicked back' },
  { id: 'sidepart', name: 'Yan Ayrık', prompt: 'a classic side part: a clean defined parting on one side, the top combed neatly across, sides tapered short, groomed and professional' },
  { id: 'crop', name: 'Tekstüre Krop', prompt: 'a textured French crop: short faded sides with a short choppy textured top and a small blunt fringe pushed forward onto the forehead' },
  { id: 'quiff', name: 'Pompadour', prompt: 'a modern quiff: the front lifted up and back off the forehead for volume, shorter faded sides, matte styled finish' },
  { id: 'flow', name: 'Orta Boy Dökük', prompt: 'a tidy medium-length cut swept back with natural movement and tapered cleanly around the ears (do not add length beyond his current hair)' }
];
function cleanHairModels(arr) {
  if (!Array.isArray(arr) || !arr.length) return DEFAULT_HAIR_MODELS;
  const out = arr.map(m => ({ id: String(m.id || '').slice(0, 24), name: String(m.name || '').slice(0, 30), prompt: String(m.prompt || '').slice(0, 400) })).filter(m => m.id && m.name);
  return out.length ? out.slice(0, 12) : DEFAULT_HAIR_MODELS;
}
function cleanHex(h, d) { h = String(h || '').trim(); return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : d; }
const STYLE_IDS = ['tropical','ocean','sade','retro','asil','bulut'];
function cleanStyle(x) { return STYLE_IDS.includes(x) ? x : 'tropical'; }
function cleanTheme(t) { t = t || {}; return { accent: cleanHex(t.accent, '#12a085'), brand: cleanHex(t.brand, '#14233f') }; }
function cleanDiscounts(d) { const o = {}; if (d && typeof d === 'object') for (const k in d) { const m = parseInt(k, 10); const v = Math.max(0, Math.round(Number(d[k]) || 0)); if (m >= 1 && m <= 24 && v > 0) o[m] = v; } return o; }
function cleanReferrers(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({ id: String(r.id || genId()).slice(0, 20), name: String(r.name || '').trim().slice(0, 40), phone: String(r.phone || '').trim().slice(0, 20), code: String(r.code || '').trim().slice(0, 24), discounts: cleanDiscounts(r.discounts), payouts: cleanDiscounts(r.payouts), iban: String(r.iban || '').trim().slice(0, 34), notify: !!r.notify, city: r.city || '', district: r.district || '', status: ['idle', 'active', 'pending'].includes(r.status) ? r.status : 'idle', app: r.app || null, completed: Array.isArray(r.completed) ? r.completed : [] })).filter(r => r.name && r.code).slice(0, 100);
}
function refInDistrict(rf, city, district) { return (rf.city === city && rf.district === district) || (rf.completed || []).some(c => c.city === city && c.district === district); }
function cleanCreditPkgs(arr) {
  if (!Array.isArray(arr)) return [{ count: 1, price: 0 }];
  const seen = new Set(), uniq = [];
  arr.map(p => ({ count: Math.max(1, Math.min(500, Math.round(Number(p.count) || 0))), price: Math.max(0, Math.round(Number(p.price) || 0)) })).filter(p => p.count >= 1)
    .forEach(p => { if (!seen.has(p.count)) { seen.add(p.count); uniq.push(p); } });
  uniq.sort((a, b) => a.count - b.count);
  return uniq.slice(0, 6).length ? uniq.slice(0, 6) : [{ count: 1, price: 0 }];
}
const OTP_REQUIRED = String(process.env.OTP_REQUIRED || 'false') === 'true'; // telefon doğrulama (SMS hesabı varsa aç)
const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'mock').toLowerCase();      // mock | netgsm ...

const hashPw = (p) => bcrypt.hashSync(String(p || ''), 10);
const checkPw = (p, stored) => { stored = String(stored || ''); if (stored.startsWith('$2')) { try { return bcrypt.compareSync(String(p || ''), stored); } catch { return false; } } return String(p || '') === stored; };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------- yardımcılar ----------
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const redirect = (res, url) => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
function signToken(payload) { const body = b64u(JSON.stringify(payload)); const sig = b64u(crypto.createHmac('sha256', SECRET).update(body).digest()); return body + '.' + sig; }
function verifyToken(t) {
  if (!t || t.indexOf('.') < 0) return null;
  const [body, sig] = t.split('.');
  const exp = b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
  if (sig !== exp) return null;
  try { const p = JSON.parse(unb64u(body)); if (p.exp && Date.now() > p.exp) return null; return p; } catch { return null; }
}
function auth(req) { const h = req.headers.authorization || ''; return verifyToken(h.startsWith('Bearer ') ? h.slice(7) : ''); }
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowTR = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => fmtDate(nowTR());
const nDaysAgo = (n) => { const d = nowTR(); d.setDate(d.getDate() - n); return fmtDate(d); };
const nowMin = () => { const d = nowTR(); return d.getHours() * 60 + d.getMinutes(); };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => /^\d{2}:\d{2}$/.test(s);
function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('90')) d = d.slice(2); if (d.length === 10) d = '0' + d; return d; }
const isPhone = (p) => /^0\d{10}$/.test(normPhone(p));
const genId = () => 's' + crypto.randomBytes(5).toString('hex');
const genStaffId = () => 'p' + crypto.randomBytes(4).toString('hex');
const validDays = (a) => Array.isArray(a) ? [...new Set(a.map(Number).filter(n => n >= 0 && n <= 6))] : [];
const validBreaks = (a) => Array.isArray(a) ? a.filter(b => b && isTime(b.start) && isTime(b.end) && toMin(b.start) < toMin(b.end)).map(b => ({ start: b.start, end: b.end })) : [];
const clampDur = (v, def) => { const n = Number(v); return (n === 15 || n === 30) ? n : def; };
const clampPrice = (v) => { let n = Math.round(Number(v) || 0); if (n < 0) n = 0; if (n > 1000000) n = 1000000; return n; };
const svc = (o, defDur) => ({ dur: defDur });
function sanitizeStaff(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(s => s && String(s.name || '').trim()).slice(0, 30).map(s => ({
    id: (String(s.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)) || genStaffId(),
    name: String(s.name).trim().slice(0, 40), phone: normPhone(s.phone),
    offDays: validDays(s.offDays), breaks: validBreaks(s.breaks),
    sac: svc(s.sac, 30), sakal: svc(s.sakal, 15)
  }));
}
function sanitizePrices(p) { p = p || {}; return { sac: clampPrice(p.sac), sakal: clampPrice(p.sakal), combo: clampPrice(p.combo) }; }
function resolveStaff(shop, staffId) {
  const staff = shop.staff || [];
  if (staff.length === 0) return { id: '', name: shop.name, phone: shop.phone || '', offDays: shop.off_days || [], breaks: shop.breaks || [], sac: { dur: 30 }, sakal: { dur: 15 } };
  if (staffId) return staff.find(x => x.id === staffId) || null;
  if (staff.length === 1) return staff[0];
  return null;
}
const pubStaff = (x) => ({ id: x.id, name: x.name, phone: x.phone || '', sac: { dur: (x.sac || {}).dur || 30 }, sakal: { dur: (x.sakal || {}).dur || 15 } });
const shopPrices = (s) => { const p = s.prices || {}; return { sac: p.sac || 0, sakal: p.sakal || 0, combo: p.combo || 0 }; };
function publicShop(s) {
  const staff = (s.staff && s.staff.length) ? s.staff : [{ id: '', name: s.name, phone: s.phone || '' }];
  return { id: s.id, name: s.name, open: s.open, close: s.close, prices: shopPrices(s), otpRequired: OTP_REQUIRED, staff: staff.map(pubStaff), googleReview: s.google_review || '' };
}
function isLive(s) { return s && s.status === 'active' && (!s.expires_at || new Date(s.expires_at).getTime() > Date.now()); }
function daysLeft(s) { if (!s || !s.expires_at) return null; return Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 86400000); }
function ownerShopView(s) {
  return { id: s.id, name: s.name, username: s.username || '', open: s.open, close: s.close, prices: shopPrices(s),
    plan: s.plan || 'trial', expiresAt: s.expires_at || null, daysLeft: daysLeft(s), expired: !isLive(s), paymentMode: PAYMENT, credits: s.credits || 0, couponOff: !!s.coupon_off, city: s.city || '', district: s.district || '', googleReview: s.google_review || '',
    staff: (s.staff || []).map(x => ({ ...pubStaff(x), offDays: x.offDays || [], breaks: x.breaks || [] })) };
}
function orderOf(shop, staff, services) {
  const keys = [...new Set((Array.isArray(services) ? services : []).filter(k => k === 'sac' || k === 'sakal'))];
  const pr = shopPrices(shop);
  let dur = 0, gross = 0;
  keys.forEach(k => { dur += (staff[k] || {}).dur || 0; gross += pr[k] || 0; });
  const discount = keys.length === 2 ? Math.min(pr.combo || 0, gross) : 0;
  return { keys, dur, price: gross - discount, gross, discount };
}
// Dinamik boş başlangıçlar: 15dk ızgara + her meşgul bloğun bittiği an; randevu gerçek süresini kaplar.
function availability(shop, staff, date, dur, appts) {
  if ((shop.closed_days || []).includes(date)) return { closed: true, slots: [] };
  if ((staff.closedDays || []).includes(date)) return { closed: true, slots: [] };
  const wd = new Date(date + 'T00:00:00').getDay();
  if ((staff.offDays || []).includes(wd)) return { closed: true, slots: [] };
  const O = toMin(shop.open), C = toMin(shop.close);
  const busy = [
    ...(staff.breaks || []).map(b => [toMin(b.start), toMin(b.end)]),
    ...(appts || []).map(a => [toMin(a.time), toMin(a.time) + (a.dur || 0)])
  ];
  const today = todayStr(), now = nowMin();
  const free = (t) => {
    if (t < O || t + dur > C) return false;
    if (date < today) return false;
    if (date === today && t <= now) return false;
    return !busy.some(([s, e]) => t < e && (t + dur) > s);
  };
  const taken = (t) => busy.some(([s, e]) => t < e && (t + GRAN) > s);
  const slots = [];
  for (let t = O; t + GRAN <= C; t += GRAN) { if (date < today || (date === today && t <= now)) continue; slots.push({ time: toTime(t), available: free(t), taken: taken(t) }); }
  return { closed: false, slots };
}

// ---------- ana handler ----------
module.exports = async (req, res) => {
  try {
    const url = req.url || '';
    const pathName = url.split('?')[0].replace(/\/+$/, '');
    const q = Object.fromEntries(new URLSearchParams(url.split('?')[1] || ''));
    const p = pathName.split('/').filter(Boolean).slice(1);
    const m = req.method;
    const P = body(req);

    if (m === 'GET' && p[0] === 'health') return send(res, 200, { ok: true, service: 'berber-defteri' });
    if (m === 'GET' && p[0] === 'config') return send(res, 200, await config());

    if (p[0] === 'shops' && p[1] && p[1] !== 'login') {
      const id = p[1];
      if (m === 'GET' && !p[2]) { const s = await getShop(id, true); return s ? send(res, 200, publicShop(s)) : send(res, 404, { error: 'Dükkân bulunamadı.' }); }
      if (m === 'GET' && p[2] === 'slots') return slots(res, id, q.date, q.staff, q.dur);
      if (m === 'POST' && p[2] === 'appointments') return book(res, id, P);
      if (m === 'POST' && p[2] === 'cancel') return cancelAppt(res, id, P);
      if (m === 'POST' && p[2] === 'login') return shopLogin(res, id, P);
    }
    if (m === 'POST' && p[0] === 'shops' && !p[1]) return createShop(res, P);
    if (m === 'POST' && p[0] === 'login' && !p[1]) return loginByUsername(res, P);
    if (m === 'POST' && p[0] === 'otp' && p[1] === 'send') return otpSend(res, P);
    if (m === 'POST' && p[0] === 'reset' && p[1] === 'start') return resetStart(res, P);
    if (m === 'POST' && p[0] === 'reset' && p[1] === 'finish') return resetFinish(res, P);
    if (m === 'POST' && p[0] === 'feedback' && !p[1]) return sendFeedback(req, res, P);
    if (m === 'GET' && p[0] === 'feedback' && p[1] === 'mine') { const tk = auth(req); if (!tk || tk.role !== 'owner') return send(res, 401, { error: 'Yetkisiz.' }); return myFeedback(res, tk.shopId); }

    if (m === 'GET' && p[0] === 'pay' && p[1]) return pay(res, p[1]);
    if (m === 'POST' && p[0] === 'payment' && p[1] === 'callback') return paymentCallback(req, res, P, q);

    if (p[0] === 'owner') {
      const tok = auth(req); if (!tok || tok.role !== 'owner') return send(res, 401, { error: 'Yetkisiz.' });
      const sid = tok.shopId;
      if (m === 'GET' && p[1] === 'shop') { const s = await getShop(sid); return s ? send(res, 200, ownerShopView(s)) : send(res, 404, { error: 'Bulunamadı.' }); }
      if (m === 'PUT' && p[1] === 'shop') return updateShop(res, sid, P);
      if (m === 'POST' && p[1] === 'appointments') return ownerAddAppt(res, sid, P);
      if (m === 'GET' && p[1] === 'customer') return ownerCustomer(res, sid, q.phone);
      if (m === 'POST' && p[1] === 'appointments' && p[3] === 'noshow') return markNoShow(res, sid, p[2]);
      if (m === 'POST' && p[1] === 'block') return blockPhone(res, sid, P, true);
      if (m === 'POST' && p[1] === 'unblock') return blockPhone(res, sid, P, false);
      if (m === 'GET' && p[1] === 'appointments') return ownerAppts(res, sid, q.date);
      if (m === 'DELETE' && p[1] === 'appointments' && p[2]) return delAppt(res, sid, p[2]);
      if (m === 'PUT' && p[1] === 'appointments' && p[2]) return reschedule(res, sid, p[2], P);
      if (m === 'GET' && p[1] === 'new-count') return newCount(res, sid);
      if (m === 'POST' && p[1] === 'seen') return markSeen(res, sid);
      if (m === 'GET' && p[1] === 'stats') return ownerStats(res, sid);
      if (m === 'POST' && p[1] === 'buy') return ownerBuy(res, sid, P);
      if (m === 'POST' && p[1] === 'buy-credits') return ownerBuyCredits(res, sid, P);
      if (m === 'POST' && p[1] === 'hair-try') return hairTry(res, sid, P);
      if (m === 'POST' && p[1] === 'close-day') return closeDay(res, sid, P);
      if (m === 'POST' && p[1] === 'open-day') return openDay(res, sid, P);
    }

    if (p[0] === 'ref') {
      if (m === 'POST' && p[1] === 'login') return refLogin(res, P);
      const rtok = auth(req); if (!rtok || rtok.role !== 'ref') return send(res, 401, { error: 'Yetkisiz.' });
      if (m === 'GET' && p[1] === 'me') return refMe(res, rtok.refId);
      if (m === 'POST' && p[1] === 'select-district') return refSelectDistrict(res, rtok.refId, P);
      if (m === 'POST' && p[1] === 'apply') return refApply(res, rtok.refId, P);
      if (m === 'POST' && p[1] === 'iban') return refSetIban(res, rtok.refId, P);
      if (m === 'POST' && p[1] === 'seen') return refSeen(res, rtok.refId);
      return send(res, 404, { error: 'Bulunamadı.' });
    }
    if (p[0] === 'platform') {
      if (m === 'POST' && p[1] === 'login') return platLogin(res, P);
      const tok = auth(req); if (!tok || tok.role !== 'plat') return send(res, 401, { error: 'Yetkisiz.' });
      if (m === 'GET' && p[1] === 'overview') return overview(res);
      if (m === 'GET' && p[1] === 'export') return platExport(res);
      if (m === 'PUT' && p[1] === 'packages') return setPackages(res, P);
      if (m === 'PUT' && p[1] === 'credit-packages') return setCreditPackages(res, P);
      if (m === 'PUT' && p[1] === 'hair-price') return setHairPrice(res, P);
      if (m === 'GET' && p[1] === 'hair-models') return send(res, 200, { models: (await getPlatform()).hairModels });
      if (m === 'PUT' && p[1] === 'hair-models') return setHairModels(res, P);
      if (m === 'POST' && p[1] === 'referrers' && p[3] === 'mark-paid') return markRefPaid(res, decodeURIComponent(p[2] || ''));
      if (m === 'PUT' && p[1] === 'coupon') return setCoupon(res, P);
      if (m === 'PUT' && p[1] === 'shops' && p[3] === 'coupon') return setShopCoupon(res, p[2], P);
      if (m === 'GET' && p[1] === 'referrers') return getReferrers(res);
      if (m === 'PUT' && p[1] === 'referrers') return setReferrers(res, P);
      if (m === 'PUT' && p[1] === 'theme') return setTheme(res, P);
      if (m === 'PUT' && p[1] === 'style') return setStyle(res, P);
      if (m === 'PUT' && p[1] === 'video') return setVideo(res, P);
      if (m === 'GET' && p[1] === 'applications') return getApplications(res);
      if (m === 'POST' && p[1] === 'applications' && p[3] === 'approve') return decideApplication(res, p[2], true);
      if (m === 'POST' && p[1] === 'applications' && p[3] === 'reject') return decideApplication(res, p[2], false);
      if (m === 'POST' && p[1] === 'applications' && p[3] === 'reply') return replyApplication(res, p[2], body);
      if (m === 'PUT' && p[1] === 'password') return setAdminPw(res, P);
      if (m === 'DELETE' && p[1] === 'shops' && p[2]) return delShop(res, p[2]);
      if (m === 'POST' && p[1] === 'shops' && p[3] === 'token') return shopToken(res, p[2]);
      if (m === 'POST' && p[1] === 'shops' && p[3] === 'extend') return platExtend(res, p[2]);
      if (m === 'POST' && p[1] === 'shops' && p[3] === 'suspend') return platSuspend(res, p[2]);
      if (m === 'GET' && p[1] === 'feedback') return adminFeedback(res);
      if (m === 'POST' && p[1] === 'feedback' && p[2] && p[3] === 'reply') return replyFeedback(res, p[2], P);
      if (m === 'DELETE' && p[1] === 'reset') return resetAll(res);
    }

    send(res, 404, { error: 'Bulunamadı.' });
  } catch (e) { console.error(e); send(res, 500, { error: 'Sunucu hatası.' }); }
};

// ---------- işlemler ----------
const DEFAULT_PACKAGES = [{ months: 1, price: 0 }];
function cleanPackages(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr.map(p => ({ months: Math.max(1, Math.min(24, Math.round(Number(p.months) || 0))), price: Math.max(0, Math.round(Number(p.price) || 0)) }))
    .filter(p => p.months >= 1);
  // aynı ay tekrarını ele, aya göre sırala, en fazla 6 paket
  const seen = new Set(); const uniq = [];
  for (const p of out) { if (!seen.has(p.months)) { seen.add(p.months); uniq.push(p); } }
  uniq.sort((a, b) => a.months - b.months);
  return uniq.slice(0, 6);
}
async function getPlatform() {
  const { data } = await supabase.from('platform').select('fee,admin_pw,packages,credit_packages,hair_models,hair_price,referrers,theme,style,coupon_enabled,promo_video,promo_desc').eq('id', 1).single();
  const pl = data || { fee: 0, admin_pw: '12345' };
  const pkgs = (pl.packages && pl.packages.length) ? cleanPackages(pl.packages) : DEFAULT_PACKAGES;
  const unit = (pkgs.find(p => p.months === 1) || {}).price || 0;
  return { ...pl, packages: pkgs, fee: unit, creditPackages: cleanCreditPkgs(pl.credit_packages), hairModels: cleanHairModels(pl.hair_models), hairPrice: Math.max(0, Math.round(Number(pl.hair_price) || 0)), referrers: cleanReferrers(pl.referrers), theme: cleanTheme(pl.theme), style: cleanStyle(pl.style), couponEnabled: pl.coupon_enabled !== false, promoVideo: pl.promo_video || '', promoDesc: pl.promo_desc || '' };
}
async function config() { const pl = await getPlatform(); return { fee: pl.fee, packages: pl.packages, paymentMode: PAYMENT, creditPackages: pl.creditPackages, hairModels: pl.hairModels.map(m => ({ id: m.id, name: m.name })), hairPrice: pl.hairPrice, theme: pl.theme, style: pl.style, couponEnabled: pl.couponEnabled, promoVideo: pl.promoVideo || '', promoDesc: pl.promoDesc || '' }; }
async function setCreditPackages(res, P) { const pk = cleanCreditPkgs(P.packages); await supabase.from('platform').update({ credit_packages: pk }).eq('id', 1); send(res, 200, { ok: true, packages: pk }); }
async function setHairPrice(res, P) { const v = Math.max(0, Math.round(Number(P.price) || 0)); await supabase.from('platform').update({ hair_price: v }).eq('id', 1); send(res, 200, { ok: true, hairPrice: v }); }
async function setHairModels(res, P) { const hm = cleanHairModels(P.models); await supabase.from('platform').update({ hair_models: hm }).eq('id', 1); send(res, 200, { ok: true, models: hm }); }
async function getReferrers(res) {
  const pl = await getPlatform();
  const { data: shops } = await supabase.from('shops').select('ref_code,plan_months,ref_paid');
  const counts = {}, pend = {};
  (shops || []).forEach(s => { if (s.ref_code) { counts[s.ref_code] = (counts[s.ref_code] || 0) + 1; if (!s.ref_paid) { const rf = pl.referrers.find(r => r.code === s.ref_code); const amt = rf ? Number((rf.payouts || {})[s.plan_months] || 0) : 0; pend[s.ref_code] = (pend[s.ref_code] || 0) + amt; } } });
  send(res, 200, { referrers: pl.referrers.map(r => ({ ...r, count: counts[r.code] || 0, pending: pend[r.code] || 0 })) });
}
async function markRefPaid(res, code) { await supabase.from('shops').update({ ref_paid: true }).eq('ref_code', code).eq('ref_paid', false); send(res, 200, { ok: true }); }
async function setStyle(res, P) { const x = cleanStyle(P.style); await supabase.from('platform').update({ style: x }).eq('id', 1); send(res, 200, { ok: true, style: x }); }
async function setCoupon(res, P) { await supabase.from('platform').update({ coupon_enabled: !!P.enabled }).eq('id', 1); send(res, 200, { ok: true, couponEnabled: !!P.enabled }); }
async function setShopCoupon(res, sid, P) { await supabase.from('shops').update({ coupon_off: !!P.off }).eq('id', sid); send(res, 200, { ok: true, couponOff: !!P.off }); }
async function setVideo(res, P) { const url = String(P.url || '').trim().slice(0, 200); const desc = String(P.desc || '').trim().slice(0, 500); await supabase.from('platform').update({ promo_video: url, promo_desc: desc }).eq('id', 1); send(res, 200, { ok: true, promoVideo: url, promoDesc: desc }); }
async function setTheme(res, P) { const t = cleanTheme(P.theme); await supabase.from('platform').update({ theme: t }).eq('id', 1); send(res, 200, { ok: true, theme: t }); }
async function setReferrers(res, P) {
  const cur = (await getPlatform()).referrers;
  const merged = cleanReferrers(P.referrers).map(r => { const old = cur.find(c => c.id === r.id); return old ? { ...r, city: old.city, district: old.district, status: old.status, app: old.app, completed: old.completed } : r; });
  await supabase.from('platform').update({ referrers: merged }).eq('id', 1); send(res, 200, { ok: true });
}
async function saveRefs(list) { await supabase.from('platform').update({ referrers: list }).eq('id', 1); }
async function refSetIban(res, refId, P) { const iban = String((P && P.iban) || '').trim().slice(0, 34); const pl = await getPlatform(); await saveRefs(pl.referrers.map(r => r.id === refId ? { ...r, iban } : r)); send(res, 200, { ok: true, iban }); }
async function refSeen(res, refId) { const pl = await getPlatform(); await saveRefs(pl.referrers.map(r => r.id === refId ? { ...r, notify: false } : r)); send(res, 200, { ok: true }); }
async function refLogin(res, P) {
  const code = String(P.code || '').trim();
  const rf = (await getPlatform()).referrers.find(r => r.code === code);
  if (!rf) return send(res, 401, { error: 'Aktivasyon kodu hatalı.' });
  send(res, 200, { token: signToken({ role: 'ref', refId: rf.id, exp: Date.now() + 60 * 86400000 }), name: rf.name });
}
async function refStats(rf) {
  const { data: shops } = await supabase.from('shops').select('ref_code,city,district,plan_months,ref_paid,name');
  const mine = (shops || []).filter(s => s.ref_code === rf.code);
  const po = rf.payouts || {};
  let pending = 0, paidTotal = 0;
  const list = mine.map(s => { const amt = Number(po[s.plan_months] || 0); if (s.ref_paid) paidTotal += amt; else pending += amt; return { name: s.name, months: s.plan_months || 0, amount: amt, paid: !!s.ref_paid }; });
  return { total: mine.length, inActive: mine.filter(s => s.city === rf.city && s.district === rf.district).length, pending, paidTotal, list };
}
async function refMe(res, refId) {
  const rf = (await getPlatform()).referrers.find(r => r.id === refId);
  if (!rf) return send(res, 404, { error: 'Bulunamadı.' });
  const st = await refStats(rf);
  const taken = [];
  pl.referrers.forEach(r => {
    if (r.city && r.district) taken.push({ city: r.city, district: r.district, mine: r.id === refId });
    (r.completed || []).forEach(c => taken.push({ city: c.city, district: c.district, mine: r.id === refId, done: true }));
  });
  send(res, 200, { name: rf.name, phone: rf.phone, code: rf.code, discount: rf.discount, city: rf.city, district: rf.district, status: rf.status, app: rf.app, completed: rf.completed, total: st.total, inActive: st.inActive, taken, discounts: rf.discounts || {}, payouts: rf.payouts || {}, iban: rf.iban || '', pending: st.pending, paidTotal: st.paidTotal, earnList: st.list, notify: !!rf.notify });
}
async function refSelectDistrict(res, refId, P) {
  const pl = await getPlatform(); const rf = pl.referrers.find(r => r.id === refId); if (!rf) return send(res, 404, { error: 'Bulunamadı.' });
  if (rf.status !== 'idle') return send(res, 400, { error: 'Önce mevcut ilçeni tamamlayıp onay almalısın.' });
  const city = String(P.city || '').trim(), district = String(P.district || '').trim();
  if (!city || !district) return send(res, 400, { error: 'İl ve ilçe seç.' });
  if (pl.referrers.some(r => refInDistrict(r, city, district))) return send(res, 400, { error: 'Bu ilçe zaten alınmış veya tamamlanmış. Lütfen başka bir ilçe seç.' });
  await saveRefs(pl.referrers.map(r => r.id === refId ? { ...r, city, district, status: 'active' } : r));
  send(res, 200, { ok: true });
}
async function refApply(res, refId, P) {
  const pl = await getPlatform(); const rf = pl.referrers.find(r => r.id === refId); if (!rf) return send(res, 404, { error: 'Bulunamadı.' });
  if (rf.status !== 'active') return send(res, 400, { error: 'Aktif bir ilçen yok.' });
  const app = { talked: Math.max(0, Math.round(Number(P.talked) || 0)), registered: Math.max(0, Math.round(Number(P.registered) || 0)), note: String(P.note || '').slice(0, 500), district: rf.district, city: rf.city };
  await saveRefs(pl.referrers.map(r => r.id === refId ? { ...r, status: 'pending', app } : r));
  send(res, 200, { ok: true });
}
async function getApplications(res) {
  const pl = await getPlatform(); const { data: shops } = await supabase.from('shops').select('ref_code');
  const apps = [];
  for (const r of pl.referrers.filter(x => x.status === 'pending')) apps.push({ id: r.id, name: r.name, phone: r.phone, code: r.code, city: r.city, district: r.district, app: r.app, brought: (shops || []).filter(s => s.ref_code === r.code).length });
  send(res, 200, { applications: apps });
}
async function decideApplication(res, id, ok) {
  const pl = await getPlatform(); const rf = pl.referrers.find(r => r.id === id); if (!rf || rf.status !== 'pending') return send(res, 404, { error: 'Başvuru yok.' });
  let upd;
  if (ok) { const completed = [...(rf.completed || []), { city: rf.city, district: rf.district }]; upd = { ...rf, status: 'idle', city: '', district: '', app: null, completed, notify: true }; }
  else upd = { ...rf, status: 'active', notify: true };
  await saveRefs(pl.referrers.map(r => r.id === id ? upd : r));
  send(res, 200, { ok: true });
}
async function replyApplication(res, id, P) {
  const pl = await getPlatform(); const rf = pl.referrers.find(r => r.id === id); if (!rf || rf.status !== 'pending') return send(res, 404, { error: 'Başvuru yok.' });
  const reply = String((P && P.reply) || '').slice(0, 500);
  const app = { ...(rf.app || {}), reply };
  await saveRefs(pl.referrers.map(r => r.id === id ? { ...r, app, notify: true } : r));
  send(res, 200, { ok: true });
}
async function ownerBuyCredits(res, sid, P) {
  const want = Math.max(1, Math.min(500, Math.round(Number(P && P.count) || 1)));
  if (PAYMENT === 'shopier') return send(res, 200, { payUrl: '/api/pay-credit/' + sid + '?adet=' + want });
  const { data: s } = await supabase.from('shops').select('credits').eq('id', sid).maybeSingle();
  const credits = (s ? s.credits || 0 : 0) + want;
  await supabase.from('shops').update({ credits }).eq('id', sid);
  send(res, 200, { ok: true, credits });
}
async function hairTry(res, sid, P) {
  const { data: shop } = await supabase.from('shops').select('credits').eq('id', sid).maybeSingle();
  if (!shop) return send(res, 404, { error: 'Dükkân bulunamadı.' });
  if ((shop.credits || 0) < 1) return send(res, 402, { error: 'Saç deneme krediniz bitti. Lütfen kredi satın alın.' });
  if (!P || !P.image || !P.modelId) return send(res, 400, { error: 'Fotoğraf ve model gerekli.' });
  const pl = await getPlatform();
  const model = pl.hairModels.find(m => m.id === P.modelId);
  if (!model) return send(res, 400, { error: 'Model bulunamadı.' });
  // ---- AI SERVİSİ BURAYA BAĞLANACAK ----
  // prompt = HAIR_BASE_PROMPT.replace('{CUT}', model.prompt); görsel = P.image (base64)
  // başarılı olursa: krediyi düş + sonucu (ve istenirse kaydı) döndür
  return send(res, 503, { error: 'AI servisi henüz bağlı değil. Sağlayıcı seçilince aktif olacak.', notConnected: true });
}
async function setPackages(res, P) {
  const pkgs = cleanPackages(P.packages);
  if (!pkgs || !pkgs.length) return send(res, 400, { error: 'En az bir paket gerekli.' });
  await supabase.from('platform').update({ packages: pkgs }).eq('id', 1);
  const valid = pkgs.map(p => p.months);
  const pl = await getPlatform();
  const refs = (pl.referrers || []).map(r => { const d = {}; for (const m in (r.discounts || {})) if (valid.includes(+m)) d[m] = r.discounts[m]; return { ...r, discounts: d }; });
  await supabase.from('platform').update({ referrers: refs }).eq('id', 1);
  send(res, 200, { ok: true, packages: pkgs });
}
async function getShop(id, activeOnly) {
  let qy = supabase.from('shops').select('*').eq('id', id);
  if (activeOnly) qy = qy.eq('status', 'active');
  const { data } = await qy.maybeSingle();
  if (activeOnly && data && !isLive(data)) return null; // aboneliği bitmiş -> müşteriye kapalı
  return data || null;
}
async function apptsFor(sid, staffId, date) {
  const { data } = await supabase.from('appointments').select('time,dur').eq('shop_id', sid).eq('staff_id', staffId).eq('date', date);
  return data || [];
}

async function slots(res, id, date, staffId, durStr) {
  if (!isDate(date)) return send(res, 400, { error: 'Geçersiz tarih.' });
  const dur = Math.round(Number(durStr) || 0);
  if (dur <= 0) return send(res, 400, { error: 'Hizmet seçin.' });
  const shop = await getShop(id, true); if (!shop) return send(res, 404, { error: 'Dükkân bulunamadı.' });
  const st = resolveStaff(shop, staffId); if (!st) return send(res, 400, { error: 'Çalışan seçin.' });
  const appts = await apptsFor(id, st.id, date);
  const { closed, slots: out } = availability(shop, st, date, dur, appts);
  send(res, 200, { closed, slots: out });
}

async function book(res, id, P) {
  const shop = await getShop(id, true); if (!shop) return send(res, 404, { error: 'Dükkân bulunamadı.' });
  const name = String(P.name || '').trim();
  if (name.length < 2) return send(res, 400, { error: 'Ad soyad girin.' });
  if (P.kvkk !== true) return send(res, 400, { error: 'KVKK onayı gerekli.' });
  if (!isDate(P.date) || !isTime(P.time)) return send(res, 400, { error: 'Tarih/saat geçersiz.' });
  const st = resolveStaff(shop, P.staff); if (!st) return send(res, 400, { error: 'Çalışan seçin.' });
  const { keys, dur, price } = orderOf(shop, st, P.services);
  if (!keys.length || dur <= 0) return send(res, 400, { error: 'En az bir hizmet seçin.' });

  const appts = await apptsFor(id, st.id, P.date);
  const { closed, slots: av } = availability(shop, st, P.date, dur, appts);
  if (closed) return send(res, 400, { error: 'Bu gün kapalı.' });
  const slot = av.find(s => s.time === P.time);
  if (!slot || !slot.available) return send(res, 409, { error: 'Bu saat uygun değil, başka saat seçin.' });

  const dev = String(P.deviceId || '').slice(0, 40);
  if (dev) { const { data: dd } = await supabase.from('appointments').select('id').eq('shop_id', id).eq('device_id', dev).eq('date', P.date).limit(1); if (dd && dd.length) return send(res, 409, { error: 'Bu cihazdan bu güne zaten bir randevu alınmış; aynı güne ikinci randevu alınamıyor.' }); }

  const { data, error } = await supabase.from('appointments')
    .insert({ shop_id: id, staff_id: st.id, customer_name: name, phone: '', date: P.date, time: P.time, dur, price, services: keys, seen: false, device_id: dev }).select('id').single();
  if (error) {
    if (String(error.code) === '23505') return send(res, 409, { error: 'Bu saat az önce doldu, başka saat seçin.' });
    return send(res, 500, { error: 'Randevu kaydedilemedi.' });
  }
  send(res, 201, { id: data.id, dur, price });
}

async function ownerAddAppt(res, sid, P) {
  const shop = await getShop(sid); if (!shop) return send(res, 404, { error: 'Bulunamadı.' });
  const name = String(P.name || '').trim(); const phone = normPhone(P.phone || '');
  if (name.length < 2) return send(res, 400, { error: 'Müşteri adı girin.', field: 'name' });
  if (phone && !isPhone(P.phone)) return send(res, 400, { error: 'Telefon 10 haneli olmalı (veya boş bırak).', field: 'phone' });
  const st = resolveStaff(shop, P.staff); if (!st) return send(res, 400, { error: 'Çalışan seçin.', field: 'staff' });
  const { keys, dur, price } = orderOf(shop, st, P.services);
  if (!keys.length || dur <= 0) return send(res, 400, { error: 'Hizmet seçin.', field: 'services' });
  if (!isDate(P.date)) return send(res, 400, { error: 'Tarih seçin.', field: 'date' });
  const appts = await apptsFor(sid, st.id, P.date);
  const { closed, slots: av } = availability(shop, st, P.date, dur, appts);
  if (closed) return send(res, 400, { error: 'Bu gün dükkân kapalı.', field: 'date' });
  const slot = av.find(s => s.time === P.time);
  if (!slot || !slot.available) return send(res, 409, { error: 'Bu saat dolu, başka saat seç.', field: 'time' });
  const { data, error } = await supabase.from('appointments').insert({ shop_id: sid, staff_id: st.id, customer_name: name, phone: phone || '', date: P.date, time: P.time, dur, price, services: keys, seen: true }).select('id').single();
  if (error) { if (String(error.code) === '23505') return send(res, 409, { error: 'Bu saat az önce doldu.' }); return send(res, 500, { error: 'Kaydedilemedi.' }); }
  send(res, 201, { id: data.id, dur, price });
}
async function cancelAppt(res, id, P) {
  const name = String(P.name || '').trim(); const date = P.date; const time = String(P.time || '');
  if (name.length < 2) return send(res, 400, { error: 'Adını gir.' });
  if (!isDate(date)) return send(res, 400, { error: 'Tarih seçin.' });
  if (!isTime(time)) return send(res, 400, { error: 'Saat seçin.' });
  const { data: ap } = await supabase.from('appointments').select('id').eq('shop_id', id).eq('customer_name', name).eq('date', date).eq('time', time).limit(1);
  if (!ap || !ap.length) return send(res, 404, { error: 'Bu bilgilere ait randevu bulunamadı. İsim, tarih ve saati doğru girdiğine emin ol.' });
  await supabase.from('appointments').delete().eq('id', ap[0].id);
  send(res, 200, { ok: true });
}

async function ownerCustomer(res, sid, phone) {
  phone = normPhone(phone || ''); if (!phone) return send(res, 400, { error: 'Telefon gerekli.' });
  const shop = await getShop(sid);
  const { data: appts } = await supabase.from('appointments').select('date,no_show').eq('shop_id', sid).eq('phone', phone);
  const list = appts || []; const today = todayStr();
  const past = list.filter(a => a.date <= today && !a.no_show).map(a => a.date).sort();
  send(res, 200, { total: list.length, lastVisit: past.length ? past[past.length - 1] : null, noShowCount: list.filter(a => a.no_show).length, blocked: (shop.blocked || []).includes(phone) });
}
async function markNoShow(res, sid, id) { await supabase.from('appointments').update({ no_show: true }).eq('id', id).eq('shop_id', sid); send(res, 200, { ok: true }); }
async function blockPhone(res, sid, P, on) {
  const phone = normPhone(P.phone || ''); if (!phone) return send(res, 400, { error: 'Telefon gerekli.' });
  const shop = await getShop(sid); let bl = shop.blocked || [];
  if (on) { if (!bl.includes(phone)) bl.push(phone); } else { bl = bl.filter(p => p !== phone); }
  await supabase.from('shops').update({ blocked: bl }).eq('id', sid);
  send(res, 200, { ok: true, blocked: on });
}

async function checkCode(res, P) {
  const pl = await getPlatform(); if (!pl.couponEnabled) return send(res, 400, { error: 'İndirim kodu girişi şu an kapalı.' }); const code = String(P.code || '').trim();
  const rf = code ? pl.referrers.find(r => r.code === code) : null;
  if (!rf) return send(res, 400, { error: 'Bu indirim kodu geçersiz.' });
  const ccity = String(P.city || '').trim(), cdist = String(P.district || '').trim();
  if (ccity && cdist && !refInDistrict(rf, ccity, cdist)) return send(res, 400, { error: 'Bu kod senin ilçende geçerli değil.' });
  send(res, 200, { valid: true, name: rf.name, code: rf.code, discounts: rf.discounts || {} });
}
async function createShop(res, P) {
  const name = String(P.name || '').trim();
  const username = String(P.username || '').trim().toLowerCase();
  const pw = String(P.password || '');
  if (name.length < 2) return send(res, 400, { error: 'Dükkân adı girin.', field: 'name' });
  if (!/^[a-z0-9-]{3,20}$/.test(username)) return send(res, 400, { error: 'Kullanıcı adı 3-20 karakter; harf, rakam veya tire.', field: 'username' });
  if (pw.length < 4) return send(res, 400, { error: 'Şifre en az 4 karakter.', field: 'password' });
  if (!isTime(P.open) || !isTime(P.close) || toMin(P.open) >= toMin(P.close)) return send(res, 400, { error: 'Çalışma saatleri geçersiz.', field: 'hours' });
  const staff = sanitizeStaff(P.staff);
  if (!staff.length) return send(res, 400, { error: 'En az bir çalışan ekleyin.', field: 'staff' });
  if (staff.some(s => s.phone && !isPhone(s.phone))) return send(res, 400, { error: 'Çalışan numarası geçersiz.', field: 'staff' });
  const { data: exist } = await supabase.from('shops').select('id').ilike('username', username).limit(1);
  if (exist && exist.length) return send(res, 409, { error: 'Bu kullanıcı adı alınmış, başka seçin.', field: 'username' });
  const city = String(P.city || '').trim(), district = String(P.district || '').trim();
  if (!city || !district) return send(res, 400, { error: 'Şehir ve ilçe seçin.', field: 'city' });
  const secQ = String(P.secQ || '').trim().slice(0, 100); const secA = String(P.secA || '').trim().toLowerCase().slice(0, 100);
  if (!secQ || secA.length < 2) return send(res, 400, { error: 'Güvenlik sorusu ve cevabını girin.', field: 'sec' });
  let ref_code = '';
  const { error } = await supabase.from('shops').insert({ id, name, username, pw: hashPw(pw), open: P.open, close: P.close, step: GRAN, staff, prices: sanitizePrices(P.prices), closed_days: [], credits: HAIR_GIFT, ref_code, city, district, plan: 'active', expires_at: new Date(Date.now() - 1000).toISOString(), status: 'active', google_review: String(P.googleReview || '').trim().slice(0, 300), sec_q: secQ, sec_a: hashPw(secA) });
  if (error) return send(res, 500, { error: 'Dükkân oluşturulamadı.' });
  if (PAYMENT === 'shopier') return send(res, 200, { payUrl: '/api/pay/' + id });
  send(res, 201, { id, token: signToken({ role: 'owner', shopId: id, exp: Date.now() + 30 * 86400000 }) });
}

async function loginByUsername(res, P) {
  const u = String(P.username || '').trim().toLowerCase();
  if (!u) return send(res, 400, { error: 'Kullanıcı adı girin.' });
  const { data: shop } = await supabase.from('shops').select('id,pw').ilike('username', u).eq('status', 'active').maybeSingle();
  if (!shop || !checkPw(P.password, shop.pw)) return send(res, 401, { error: 'Kullanıcı adı veya şifre hatalı.' });
  send(res, 200, { token: signToken({ role: 'owner', shopId: shop.id, exp: Date.now() + 30 * 86400000 }) });
}
async function shopLogin(res, id, P) {
  const shop = await getShop(id, true); if (!shop) return send(res, 404, { error: 'Dükkân bulunamadı.' });
  if (!checkPw(P.password, shop.pw)) return send(res, 401, { error: 'Şifre hatalı.' });
  send(res, 200, { token: signToken({ role: 'owner', shopId: id, exp: Date.now() + 30 * 86400000 }) });
}

async function updateShop(res, sid, P) {
  const shop = await getShop(sid); if (!shop) return send(res, 404, { error: 'Bulunamadı.' });
  if (!isTime(P.open) || !isTime(P.close) || toMin(P.open) >= toMin(P.close)) return send(res, 400, { error: 'Çalışma saatleri geçersiz.', field: 'hours' });
  if (P.password && String(P.password).length < 4) return send(res, 400, { error: 'Şifre en az 4 karakter.' });
  const staff = sanitizeStaff(P.staff);
  if (!staff.length) return send(res, 400, { error: 'En az bir çalışan olmalı.' });
  if (staff.some(s => !isPhone(s.phone))) return send(res, 400, { error: 'Her çalışan için geçerli telefon girin.', field: 'staff' });
  const upd = { name: String(P.name || shop.name).trim(), open: P.open, close: P.close, staff, prices: sanitizePrices(P.prices), google_review: String(P.googleReview || '').trim().slice(0, 300) };
  if (P.password) upd.pw = hashPw(P.password);
  const { error } = await supabase.from('shops').update(upd).eq('id', sid);
  if (error) return send(res, 500, { error: 'Kaydedilemedi.' });
  send(res, 200, { ok: true });
}

async function ownerAppts(res, sid, date) {
  const d = isDate(date) ? date : todayStr();
  const shop = await getShop(sid);
  const staff = (shop && shop.staff) || [];
  const nameOf = (x) => { const f = staff.find(s => s.id === x); return f ? f.name : ''; };
  const { data } = await supabase.from('appointments').select('id,customer_name,phone,time,dur,price,services,staff_id').eq('shop_id', sid).eq('date', d).order('time');
  const appts = (data || []).map(a => ({ id: a.id, customer_name: a.customer_name, phone: a.phone, time: a.time, dur: a.dur || 0, price: a.price || 0, services: a.services || [], staff_id: a.staff_id || '', staff: nameOf(a.staff_id || '') }));
  const closedStaff = staff.filter(s => (s.closedDays || []).includes(d)).map(s => ({ id: s.id, name: s.name }));
  send(res, 200, { date: d, appointments: appts, hasStaff: staff.length > 1, staffList: staff.map(s => ({ id: s.id, name: s.name })), closed: (shop && (shop.closed_days || []).includes(d)) || false, closedStaff });
}
async function reschedule(res, sid, id, P) {
  if (!isDate(P.date) || !isTime(P.time)) return send(res, 400, { error: 'Tarih/saat geçersiz.' });
  const shop = await getShop(sid); if (!shop) return send(res, 404, { error: 'Bulunamadı.' });
  const { data: appt } = await supabase.from('appointments').select('*').eq('id', id).eq('shop_id', sid).maybeSingle();
  if (!appt) return send(res, 404, { error: 'Randevu bulunamadı.' });
  const st = resolveStaff(shop, appt.staff_id || '') || { offDays: [], breaks: [] };
  const others = (await apptsFor(sid, appt.staff_id || '', P.date)).filter(a => a.time !== appt.time || P.date !== appt.date);
  const dur = appt.dur || 0;
  const { closed, slots: av } = availability(shop, st, P.date, dur, others);
  if (closed) return send(res, 400, { error: 'Bu gün kapalı.' });
  const slot = av.find(s => s.time === P.time);
  if (!slot || !slot.available) return send(res, 409, { error: 'O saat uygun değil.' });
  const { error } = await supabase.from('appointments').update({ date: P.date, time: P.time }).eq('id', id).eq('shop_id', sid);
  if (error) return send(res, 500, { error: 'Güncellenemedi.' });
  send(res, 200, { ok: true });
}
async function delAppt(res, sid, id) { await supabase.from('appointments').delete().eq('id', id).eq('shop_id', sid); send(res, 200, { ok: true }); }
async function newCount(res, sid) { const { count } = await supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('shop_id', sid).eq('seen', false); send(res, 200, { count: count || 0 }); }
async function markSeen(res, sid) { await supabase.from('appointments').update({ seen: true }).eq('shop_id', sid).eq('seen', false); send(res, 200, { ok: true }); }
async function ownerStats(res, sid) {
  const shop = await getShop(sid); const staff = (shop && shop.staff) || [];
  const { data } = await supabase.from('appointments').select('date,time,dur,price,staff_id,no_show').eq('shop_id', sid);
  const today = todayStr(), now = nowMin(), wa = nDaysAgo(6), ym = today.slice(0, 7);
  const done = (a) => a.date < today || (a.date === today && (toMin(a.time) + (a.dur || 0)) <= now);
  const all = (data || []).filter(done).filter(a => !a.no_show);
  const sum = (arr) => arr.reduce((t, a) => t + (a.price || 0), 0);
  const per = (arr) => ({
    today: { count: arr.filter(a => a.date === today).length, earn: sum(arr.filter(a => a.date === today)) },
    week: { count: arr.filter(a => a.date >= wa && a.date <= today).length, earn: sum(arr.filter(a => a.date >= wa && a.date <= today)) },
    month: { count: arr.filter(a => String(a.date).slice(0, 7) === ym).length, earn: sum(arr.filter(a => String(a.date).slice(0, 7) === ym)) },
    total: { count: arr.length, earn: sum(arr) }
  });
  const out = { ...per(all), perStaff: staff.map(s => ({ name: s.name, ...per(all.filter(a => (a.staff_id || '') === s.id)) })) };
  const cut = nDaysAgo(179), sm = {};
  for (const a of all) { if (a.date < cut) continue; const r = sm[a.date] = sm[a.date] || { n: 0, tl: 0, s: {} }; r.n++; r.tl += (a.price || 0); const k = a.staff_id || ''; const t = r.s[k] = r.s[k] || { n: 0, tl: 0 }; t.n++; t.tl += (a.price || 0); }
  out.series = Object.keys(sm).sort().map(d => ({ d, ...sm[d] }));
  out.staffList = staff.map(s => ({ id: s.id, name: s.name }));
  send(res, 200, out);
}
async function closeDay(res, sid, P) {
  if (!isDate(P.date)) return send(res, 400, { error: 'Tarih geçersiz.' });
  const shop = await getShop(sid); if (!shop) return send(res, 404, { error: 'Bulunamadı.' });
  const date = P.date, staffId = P.staffId || '';
  let appts;
  if (staffId) {
    const staff = (shop.staff || []).map(s => s.id === staffId ? { ...s, closedDays: [...new Set([...(s.closedDays || []), date])] } : s);
    const { data } = await supabase.from('appointments').select('customer_name,phone,time,dur,services,staff_id').eq('shop_id', sid).eq('date', date).eq('staff_id', staffId).order('time');
    appts = data || [];
    await supabase.from('shops').update({ staff }).eq('id', sid);
    await supabase.from('appointments').delete().eq('shop_id', sid).eq('date', date).eq('staff_id', staffId);
  } else {
    const cd = new Set(shop.closed_days || []); cd.add(date);
    const { data } = await supabase.from('appointments').select('customer_name,phone,time,dur,services,staff_id').eq('shop_id', sid).eq('date', date).order('time');
    appts = data || [];
    await supabase.from('shops').update({ closed_days: [...cd] }).eq('id', sid);
    await supabase.from('appointments').delete().eq('shop_id', sid).eq('date', date);
  }
  send(res, 200, { ok: true, affected: appts });
}
async function openDay(res, sid, P) {
  const shop = await getShop(sid); if (!shop) return send(res, 404, { error: 'Bulunamadı.' });
  const date = P.date, staffId = P.staffId || '';
  if (staffId) {
    const staff = (shop.staff || []).map(s => s.id === staffId ? { ...s, closedDays: (s.closedDays || []).filter(d => d !== date) } : s);
    await supabase.from('shops').update({ staff }).eq('id', sid);
  } else {
    await supabase.from('shops').update({ closed_days: (shop.closed_days || []).filter(d => d !== date) }).eq('id', sid);
  }
  send(res, 200, { ok: true });
}

async function platLogin(res, P) { const pl = await getPlatform(); if (!checkPw(P.password, pl.admin_pw)) return send(res, 401, { error: 'Şifre hatalı.' }); send(res, 200, { token: signToken({ role: 'plat', exp: Date.now() + 7 * 86400000 }) }); }
async function overview(res) {
  const pl = await getPlatform();
  const { data: shops } = await supabase.from('shops').select('id,name,plan,expires_at,status,coupon_off').neq('status', 'pending').order('created_at', { ascending: false });
  const { count: totalAppts } = await supabase.from('appointments').select('id', { count: 'exact', head: true });
  const out = [];
  for (const s of shops || []) {
    const { count } = await supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('shop_id', s.id);
    out.push({ id: s.id, name: s.name, count: count || 0, plan: s.plan || 'trial', daysLeft: daysLeft(s), expired: !isLive(s), couponOff: !!s.coupon_off });
  }
  send(res, 200, { fee: pl.fee, totalAppts: totalAppts || 0, shops: out, pwWarn: checkPw('12345', pl.admin_pw) });
}
async function platExtend(res, id) { const s = await getShop(id); if (!s) return send(res, 404, { error: 'Bulunamadı.' }); const expiresAt = await activateShop(id); send(res, 200, { ok: true, expiresAt, daysLeft: Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000) }); }
async function platSuspend(res, id) { await supabase.from('shops').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id); send(res, 200, { ok: true }); }
async function setFee(res, P) { const f = Number(P.fee); if (isNaN(f) || f < 0) return send(res, 400, { error: 'Geçersiz ücret.' }); await supabase.from('platform').update({ fee: Math.round(f) }).eq('id', 1); send(res, 200, { ok: true }); }
async function platExport(res) {
  const [sh, ap, pl] = await Promise.all([supabase.from('shops').select('*'), supabase.from('appointments').select('*'), getPlatform()]);
  send(res, 200, { exported_at: new Date().toISOString(), platform: pl, shops: sh.data || [], appointments: ap.data || [] });
}
async function setAdminPw(res, P) { const p = String(P.password || ''); if (p.length < 4) return send(res, 400, { error: 'Şifre en az 4 karakter.' }); await supabase.from('platform').update({ admin_pw: hashPw(p) }).eq('id', 1); send(res, 200, { ok: true }); }
async function delShop(res, id) { await supabase.from('shops').delete().eq('id', id); send(res, 200, { ok: true }); }
async function shopToken(res, id) { const s = await getShop(id); if (!s) return send(res, 404, { error: 'Bulunamadı.' }); send(res, 200, { token: signToken({ role: 'owner', shopId: id, exp: Date.now() + 30 * 86400000 }) }); }
async function sendFeedback(req, res, P) {
  const msg = String(P.message || '').trim().slice(0, 1000);
  if (msg.length < 2) return send(res, 400, { error: 'Mesaj yazın.' });
  let shop_id = null, shop_name = String(P.name || '').trim().slice(0, 60) || 'Anonim';
  const tk = auth(req);
  if (tk && tk.role === 'owner') { const s = await getShop(tk.shopId); if (s) { shop_id = s.id; shop_name = s.name; } }
  const { error } = await supabase.from('feedback').insert({ shop_id, shop_name, message: msg });
  if (error) return send(res, 500, { error: 'Gönderilemedi.' });
  send(res, 200, { ok: true });
}
async function myFeedback(res, shopId) {
  const { data } = await supabase.from('feedback').select('id,message,reply,created_at').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(50);
  send(res, 200, { items: data || [] });
}
async function adminFeedback(res) {
  const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
  send(res, 200, { items: data || [] });
}
async function replyFeedback(res, id, P) {
  const r = String(P.reply || '').trim().slice(0, 1000);
  if (r.length < 1) return send(res, 400, { error: 'Yanıt yazın.' });
  await supabase.from('feedback').update({ reply: r, replied_at: new Date().toISOString() }).eq('id', id);
  send(res, 200, { ok: true });
}
async function resetAll(res) { await supabase.from('appointments').delete().neq('id', -1); await supabase.from('shops').delete().neq('id', ''); send(res, 200, { ok: true }); }

async function activateShop(id, months) {
  months = Math.max(1, Math.min(24, Number(months) || 1));
  const { data: s } = await supabase.from('shops').select('expires_at').eq('id', id).maybeSingle();
  const base = s && s.expires_at && new Date(s.expires_at).getTime() > Date.now() ? new Date(s.expires_at).getTime() : Date.now();
  const expires_at = new Date(base + months * PLAN_DAYS * 86400000).toISOString();
  await supabase.from('shops').update({ status: 'active', plan: 'active', expires_at }).eq('id', id);
  return expires_at;
}
async function pay(res, id) {
  const shop = await getShop(id); if (!shop) return redirect(res, '/');
  if (PAYMENT !== 'shopier') { await activateShop(id); return redirect(res, '/#shop=' + id); }
  if (!SHOPIER_PAY_URL) return redirect(res, '/?odeme=ayarsiz');
  const sep = SHOPIER_PAY_URL.includes('?') ? '&' : '?';
  redirect(res, SHOPIER_PAY_URL + sep + 'platform_order_id=' + encodeURIComponent(id));
}
async function paymentCallback(req, res, P, q) {
  const id = P.platform_order_id || q.platform_order_id;
  if (!id) return redirect(res, '/?odeme=hata');
  if (SHOPIER_CALLBACK_SECRET && (P.secret || q.secret) !== SHOPIER_CALLBACK_SECRET) return redirect(res, '/?odeme=dogrulanamadi');
  await activateShop(id);
  redirect(res, '/#shop=' + id);
}
async function ownerBuy(res, sid, P) {
  const months = Math.max(1, Math.min(24, Number(P && P.months) || 1));
  const code = String(P && P.code || '').trim();
  if (code) {
    const pl = await getPlatform();
    const rf = pl.referrers.find(r => r.code === code);
    if (rf) { const { data: sh2 } = await supabase.from('shops').select('city,district,ref_code').eq('id', sid).single(); if (sh2 && refInDistrict(rf, sh2.city, sh2.district) && !sh2.ref_code) await supabase.from('shops').update({ ref_code: rf.code, plan_months: months, ref_paid: false }).eq('id', sid); }
  }
  if (PAYMENT === 'shopier') return send(res, 200, { payUrl: '/api/pay/' + sid + '?ay=' + months });
  const expiresAt = await activateShop(sid, months); // mock: test için süreyi uzatır
  send(res, 200, { ok: true, expiresAt, daysLeft: Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000) });
}

// ---------- OTP (telefon doğrulama) ----------
// Gerçek SMS gönderimi. SMS_PROVIDER=netgsm ve env anahtarları girilince canlı SMS atar.
async function sendSms(phone, message) {
  const p = normPhone(phone);
  if (SMS_PROVIDER === 'netgsm') {
    const u = process.env.NETGSM_USER, pw = process.env.NETGSM_PASS, hdr = process.env.NETGSM_HEADER;
    if (!u || !pw || !hdr) throw new Error('SMS ayarları eksik');
    const url = 'https://api.netgsm.com.tr/sms/send/get?usercode=' + encodeURIComponent(u) +
      '&password=' + encodeURIComponent(pw) + '&gsmno=' + encodeURIComponent(p) +
      '&message=' + encodeURIComponent(message) + '&msgheader=' + encodeURIComponent(hdr);
    const r = await fetch(url);
    const t = (await r.text()).trim();
    if (!/^0[0-2]/.test(t)) throw new Error('SMS sağlayıcı hatası: ' + t.slice(0, 40)); // 00/01/02 = başarı
    return true;
  }
  return false; // mock
}
async function otpSend(res, P) {
  const phone = normPhone(P.phone);
  if (!isPhone(P.phone)) return send(res, 400, { error: 'Geçerli telefon girin.' });
  const code = String(Math.floor(1000 + Math.random() * 9000)); // 4 haneli
  const otpToken = signToken({ t: 'otp', phone, ch: sha(code + SECRET), exp: Date.now() + 5 * 60000 });
  if (SMS_PROVIDER === 'mock') return send(res, 200, { otpToken, devCode: code });
  try { await sendSms(phone, 'Randevu dogrulama kodunuz: ' + code); }
  catch (e) { return send(res, 502, { error: 'SMS gonderilemedi, biraz sonra tekrar deneyin.' }); }
  send(res, 200, { otpToken });
}
function otpOk(P) {
  if (!OTP_REQUIRED) return true;
  const tok = verifyToken(P.otpToken);
  if (!tok || tok.t !== 'otp') return false;
  if (tok.phone !== normPhone(P.phone)) return false;
  return tok.ch === sha(String(P.otp || '') + SECRET);
}
const maskPhone = (p) => { p = normPhone(p); return p.length === 11 ? p.slice(0, 4) + ' ••• •• ' + p.slice(-2) : '•••'; };
async function resetStart(res, P) {
  const u = String(P.username || '').trim().toLowerCase();
  const { data: shop } = await supabase.from('shops').select('id,sec_q').ilike('username', u).maybeSingle();
  if (!shop || !shop.sec_q) return send(res, 404, { error: 'Bu kullanıcı adına ait güvenlik sorusu bulunamadı.' });
  send(res, 200, { question: shop.sec_q });
}
async function resetFinish(res, P) {
  const u = String(P.username || '').trim().toLowerCase();
  const pw = String(P.password || '');
  if (pw.length < 4) return send(res, 400, { error: 'Yeni şifre en az 4 karakter.' });
  const ans = String(P.answer || '').trim().toLowerCase();
  if (!ans) return send(res, 400, { error: 'Güvenlik sorusunun cevabını girin.' });
  const { data: shop } = await supabase.from('shops').select('id,sec_a').ilike('username', u).maybeSingle();
  if (!shop) return send(res, 404, { error: 'Kullanıcı bulunamadı.' });
  if (!shop.sec_a || !checkPw(ans, shop.sec_a)) return send(res, 400, { error: 'Cevap yanlış, tekrar deneyin.' });
  await supabase.from('shops').update({ pw: hashPw(pw) }).eq('id', shop.id);
  send(res, 200, { ok: true });
}
