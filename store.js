/* ═══════════════════════════════════════
   BARBER BOOKING — store.js (customer site)
═══════════════════════════════════════ */
const SB_URL = 'https://aweuqtiqfxjoflvvturi.supabase.co';
const SB_KEY = 'sb_publishable_DIHyv13-yCxgBKIC8PYCvQ_394bcWSE';
const sb = supabase.createClient(SB_URL, SB_KEY);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const EGP = v => `${Number(v).toLocaleString('ar-EG')} جنيه`;
const dur = m => {
  m = Math.round(m);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60), r = m % 60;
  return (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`) + (r ? ` و${r} دقيقة` : '');
};
const clock = min => new Date(Date.now() + min * 60000).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const aheadTxt = n => n === 0 ? 'مفيش حد — إنت الأول' : n === 1 ? 'شخص واحد' : n === 2 ? 'شخصين' : `${n} أشخاص`;

function toast(msg, type = '', ms = 3200) {
  const t = document.createElement('div');
  t.className = 'tst' + (type ? ' ' + type : '');
  t.textContent = msg;
  $('tc').appendChild(t);
  setTimeout(() => { t.classList.add('hid'); setTimeout(() => t.remove(), 300); }, ms);
}
window.closeMo = id => $(id).classList.remove('open');
const openMo = id => $(id).classList.add('open');
document.addEventListener('click', e => { if (e.target.classList.contains('mo')) e.target.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.mo.open').forEach(m => m.classList.remove('open')); });

/* ── State ── */
let barbers = [], services = [], packages = [], queue = {};
let settings = {};
let selBarber = undefined;          // undefined = لسه، 'any' = أي حلاق، رقم = حلاق محدد
let mode = 'services';
let selServices = new Set();
let selPackage = null;

/* ══ LOAD ══ */
async function loadAll() {
  const [b, s, p, st] = await Promise.all([
    sb.from('barbers').select('*').eq('active', true).order('sort').order('id'),
    sb.from('services').select('*').eq('active', true).order('sort').order('id'),
    sb.from('packages').select('*').eq('active', true).order('id'),
    sb.from('settings').select('*'),
  ]);
  if (b.error || s.error) {
    $('barbers').innerHTML = '<div class="empty">❌ تعذر تحميل البيانات. تأكد من تشغيل ملف SQL في Supabase.</div>';
    return;
  }
  barbers = b.data || []; services = s.data || []; packages = p.data || [];
  settings = Object.fromEntries((st.data || []).map(r => [r.key, r.value]));
  applySettings();
  await loadQueue();
  renderServices(); renderPackages(); updateBar();
}

async function loadQueue() {
  const { data } = await sb.rpc('barbers_queue');
  queue = Object.fromEntries((data || []).map(r => [r.barber_id, r]));
  renderBarbers();
}

function applySettings() {
  const name = settings.shop_name || 'Barber Shop';
  $('shopName').textContent = name; $('shopName2').textContent = name;
  document.title = `احجز عند ${name}`;
  $('closedBanner').style.display = settings.accepting === 'false' ? 'block' : 'none';
}

/* ══ RENDER ══ */
function renderBarbers() {
  if (!barbers.length) { $('barbers').innerHTML = '<div class="empty">لا يوجد حلاقين متاحين حالياً</div>'; return; }
  const waits = barbers.map(b => queue[b.id] || { ahead: 0, wait_min: 0 });
  const best = waits.reduce((a, c) => c.wait_min < a.wait_min ? c : a, waits[0]);
  const pill = q => q.ahead === 0
    ? '<span class="q-pill">فاضي دلوقتي ✅</span>'
    : `<span class="q-pill busy">قدامك ${q.ahead} · حوالي ${dur(q.wait_min)}</span>`;

  const any = `<div class="card ${selBarber === 'any' ? 'sel' : ''}" onclick="pickBarber('any')">
    <div class="avatar">⚡</div><div class="c-name">أي حلاق متاح</div>
    <div class="c-sub">هنحجزلك عند الأسرع</div>${pill(best)}</div>`;

  $('barbers').innerHTML = any + barbers.map(b => {
    const q = queue[b.id] || { ahead: 0, wait_min: 0 };
    return `<div class="card ${selBarber === b.id ? 'sel' : ''}" onclick="pickBarber(${b.id})">
      <div class="avatar">${b.photo_url ? `<img src="${esc(b.photo_url)}" alt="${esc(b.name)}"/>` : esc(b.name.charAt(0))}</div>
      <div class="c-name">${esc(b.name)}</div><div class="c-sub">${esc(b.specialty || '')}</div>${pill(q)}</div>`;
  }).join('');
}

function renderServices() {
  $('services').innerHTML = services.length ? services.map(s => `
    <div class="card svc ${selServices.has(s.id) ? 'sel' : ''}" onclick="toggleService(${s.id})">
      <div class="row"><span class="c-name">${esc(s.name)}</span><span class="p">${EGP(s.price)}</span></div>
      <div class="d">⏱ ${dur(s.duration_min)}</div></div>`).join('')
    : '<div class="empty">لا توجد خدمات</div>';
}

function renderPackages() {
  $('packages').innerHTML = packages.length ? packages.map(p => `
    <div class="card svc ${selPackage === p.id ? 'sel' : ''}" onclick="pickPackage(${p.id})">
      <span class="badge-pk">🎁 باكدج</span>
      <div class="row"><span class="c-name">${esc(p.name)}</span></div>
      <div class="d">${esc(p.description || '')}</div>
      <div class="row"><span class="d">⏱ ${dur(p.duration_min)}</span>
        <span class="p">${EGP(p.price)}${p.old_price ? `<span class="old">${EGP(p.old_price)}</span>` : ''}</span></div></div>`).join('')
    : '<div class="empty">لا توجد باكدجات حالياً</div>';
}

/* ══ SELECTION ══ */
window.pickBarber = id => { selBarber = id; renderBarbers(); updateBar(); };
window.toggleService = id => {
  selServices.has(id) ? selServices.delete(id) : selServices.add(id);
  renderServices(); updateBar();
};
window.pickPackage = id => { selPackage = selPackage === id ? null : id; renderPackages(); updateBar(); };

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  mode = t.dataset.mode;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  $('services').style.display = mode === 'services' ? '' : 'none';
  $('packages').style.display = mode === 'packages' ? '' : 'none';
  updateBar();
}));

function current() {
  if (mode === 'packages') {
    const p = packages.find(x => x.id === selPackage);
    return p ? { dur: p.duration_min, price: Number(p.price) } : null;
  }
  const list = services.filter(s => selServices.has(s.id));
  return list.length ? { dur: list.reduce((a, s) => a + s.duration_min, 0), price: list.reduce((a, s) => a + Number(s.price), 0) } : null;
}

function updateBar() {
  const c = current();
  $('sumDur').textContent = c ? dur(c.dur) : '—';
  $('sumPrice').textContent = c ? EGP(c.price) : '—';
  $('bookBtn').disabled = !c || selBarber === undefined || settings.accepting === 'false';
  $('bookBtn').textContent = selBarber === undefined ? 'اختار الحلاق الأول' : !c ? 'اختار خدمة' : '✂ احجز دلوقتي';
}

/* ══ BOOK ══ */
$('bookBtn').addEventListener('click', async () => {
  const name = $('custName').value.trim();
  const phone = $('custPhone').value.replace(/[\s-]/g, '');
  if (!name) { toast('ادخل اسمك', 'err'); $('custName').focus(); return; }
  if (!/^\+?\d{10,14}$/.test(phone)) { toast('رقم الموبايل غير صحيح', 'err'); $('custPhone').focus(); return; }

  const btn = $('bookBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الحجز...';
  const { data, error } = await sb.rpc('create_booking', {
    p_name: name, p_phone: phone,
    p_barber: selBarber === 'any' ? null : selBarber,
    p_service_ids: mode === 'services' ? [...selServices] : [],
    p_package_id: mode === 'packages' ? selPackage : null,
    p_notes: $('custNotes').value.trim() || null,
  });
  if (error) { toast(error.message || 'حصل خطأ، حاول تاني', 'err', 4500); updateBar(); return; }

  try { localStorage.setItem('bb_phone', phone); } catch (e) {}
  $('dBarber').textContent = `عند الحلاق ${data.barber_name}`;
  $('dNo').textContent = `#${data.ticket_no}`;
  $('dAhead').textContent = aheadTxt(data.ahead);
  $('dTime').textContent = data.wait_min === 0 ? 'دلوقتي' : clock(data.wait_min);
  $('dDur').textContent = dur(data.duration_min);
  $('dPrice').textContent = EGP(data.price);
  openMo('moDone');

  selServices.clear(); selPackage = null; selBarber = undefined;
  renderServices(); renderPackages(); loadQueue(); updateBar();
});

/* ══ TRACK ══ */
let trkTimer = null;
function openTrack() {
  try { $('trkPhone').value = localStorage.getItem('bb_phone') || $('trkPhone').value; } catch (e) {}
  openMo('moTrack');
  if ($('trkPhone').value) track();
}
$('trackBtn').addEventListener('click', openTrack);
$('dTrack').addEventListener('click', () => { closeMo('moDone'); openTrack(); });
$('trkGo').addEventListener('click', track);
$('trkPhone').addEventListener('keydown', e => { if (e.key === 'Enter') track(); });

async function track() {
  const phone = $('trkPhone').value.replace(/[\s-]/g, '');
  if (!phone) return;
  const { data, error } = await sb.rpc('track_booking', { p_phone: phone });
  if (error) { toast('تعذر جلب الحجز', 'err'); return; }
  try { localStorage.setItem('bb_phone', phone); } catch (e) {}
  $('trkList').innerHTML = data.length ? data.map(b => {
    const names = (b.items || []).map(i => esc(i.name)).join(' + ');
    const body = b.status === 'in_service'
      ? '<b style="color:var(--green)">دورك دلوقتي ✂️ — إنت على الكرسي</b>'
      : b.ahead === 0
        ? '<b>إنت التالي! جهّز نفسك 🔔</b>'
        : `قدامك <b>${aheadTxt(b.ahead)}</b><br>دورك تقريباً الساعة <b>${clock(b.wait_min)}</b> (بعد حوالي ${dur(b.wait_min)})`;
    return `<div class="trk">
      <div class="trk-top"><span class="trk-no">#${b.ticket_no} · ${esc(b.barber_name || '')}</span>
        <span class="st ${b.status}">${b.status === 'in_service' ? 'شغّال' : 'في الانتظار'}</span></div>
      <div class="mut">${names} · ${EGP(b.price)}</div>
      <div style="margin-top:8px;font-size:.9rem;line-height:1.7">${body}</div>
      ${b.status === 'waiting' ? `<button class="btn btn-red btn-sm" style="margin-top:10px" onclick="cancelBk(${b.id})">إلغاء الحجز</button>` : ''}
    </div>`;
  }).join('') : '<div class="empty" style="padding:24px 0 8px">مفيش حجوزات نشطة النهارده على الرقم ده</div>';

  clearInterval(trkTimer);
  trkTimer = setInterval(() => { $('moTrack').classList.contains('open') ? track() : clearInterval(trkTimer); }, 20000);
}

window.cancelBk = async id => {
  if (!confirm('متأكد إنك عايز تلغي الحجز؟')) return;
  const { data } = await sb.rpc('cancel_booking', { p_id: id, p_phone: $('trkPhone').value.replace(/[\s-]/g, '') });
  toast(data ? 'تم إلغاء الحجز' : 'مينفعش الإلغاء دلوقتي', data ? 'ok' : 'err');
  track(); loadQueue();
};

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded', () => {
  $('yr').textContent = new Date().getFullYear();
  loadAll();
  setInterval(loadQueue, 30000);
});
