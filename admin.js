/* ═══════════════════════════════════════
   BARBER BOOKING — admin.js
   تسجيل الدخول عن طريق Supabase Auth (مفيش باسورد مكتوب في الكود)
═══════════════════════════════════════ */
const SB_URL = 'https://aweuqtiqfxjoflvvturi.supabase.co';
const SB_KEY = 'sb_publishable_DIHyv13-yCxgBKIC8PYCvQ_394bcWSE';
const sb = supabase.createClient(SB_URL, SB_KEY);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const EGP = v => `${Number(v || 0).toLocaleString('ar-EG')} ج`;
const tm = s => new Date(s).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const STATUS = { waiting: 'انتظار', in_service: 'شغّال', done: 'مكتمل', cancelled: 'ملغي', no_show: 'ما جاش' };

function toast(msg, type = '', ms = 3000) {
  const t = document.createElement('div');
  t.className = 'tst' + (type ? ' ' + type : '');
  t.textContent = msg; $('tc').appendChild(t);
  setTimeout(() => { t.classList.add('hid'); setTimeout(() => t.remove(), 300); }, ms);
}
window.closeMo = id => $(id).classList.remove('open');
const openMo = id => $(id).classList.add('open');
document.addEventListener('click', e => { if (e.target.classList.contains('mo')) e.target.classList.remove('open'); });

/* ── State ── */
let barbers = [], services = [], packages = [], todayBk = [], settings = {};
let started = false, timer = null;

/* ══ AUTH ══ */
async function tryLogin() {
  const { error } = await sb.auth.signInWithPassword({ email: $('loginUser').value.trim(), password: $('loginPass').value });
  if (error) {
    $('loginErr').style.display = 'block'; $('loginPass').value = '';
    setTimeout(() => $('loginErr').style.display = 'none', 3500);
    return;
  }
  $('loginScreen').style.display = 'none'; start();
}
$('loginBtn').addEventListener('click', tryLogin);
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
$('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });
$('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

/* ══ NAV ══ */
document.querySelectorAll('.nav[data-tab]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav[data-tab]').forEach(b => b.classList.toggle('on', b === btn));
  document.querySelectorAll('.tab-p').forEach(p => p.classList.remove('on'));
  $('tab-' + btn.dataset.tab).classList.add('on');
  if (btn.dataset.tab === 'history') loadHistory();
  closeSB();
}));
function closeSB() { $('sidebar').classList.remove('open'); $('sbOv').style.display = 'none'; }
$('mobBtn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('sbOv').style.display = 'block'; });
$('sbOv').addEventListener('click', closeSB);

/* ══ LOAD ══ */
async function loadAll() {
  const [b, s, p, bk, st] = await Promise.all([
    sb.from('barbers').select('*').order('sort').order('id'),
    sb.from('services').select('*').order('sort').order('id'),
    sb.from('packages').select('*').order('id'),
    sb.from('bookings').select('*').eq('booking_date', todayStr()).order('id'),
    sb.from('settings').select('*'),
  ]);
  if (b.error) { console.error('load error', b.error); toast('تعذر تحميل البيانات، يرجى إعادة المحاولة', 'err', 5000); return; }
  barbers = b.data || []; services = s.data || []; packages = p.data || []; todayBk = bk.data || [];
  settings = Object.fromEntries((st.data || []).map(r => [r.key, r.value]));
  $('admName').textContent = settings.shop_name || 'Barber Shop';
  renderQueue(); renderLists(); renderSettings();
}
async function loadToday() {
  const { data } = await sb.from('bookings').select('*').eq('booking_date', todayStr()).order('id');
  todayBk = data || []; renderQueue();
}
async function start() {
  if (started) return; started = true;
  await loadAll();
  timer = setInterval(loadToday, 10000);
}

/* ══ QUEUE ══ */
function remaining(b) {
  if (b.status === 'in_service' && b.started_at) return Math.max(b.duration_min - (Date.now() - new Date(b.started_at)) / 60000, 0);
  return b.duration_min;
}
const durTxt = m => { m = Math.round(m); return m < 60 ? `${m} د` : `${Math.floor(m / 60)} س${m % 60 ? ' ' + (m % 60) + ' د' : ''}`; };

function renderQueue() {
  const active = todayBk.filter(b => ['waiting', 'in_service'].includes(b.status));
  const done = todayBk.filter(b => b.status === 'done');
  $('sWait').textContent = active.length;
  $('sDone').textContent = done.length;
  $('sRev').textContent = EGP(done.reduce((s, b) => s + Number(b.price), 0));
  $('sAvg').textContent = done.length ? durTxt(done.reduce((s, b) => s + b.duration_min, 0) / done.length) : '—';
  const bd = $('qBadge'); bd.style.display = active.length ? 'inline-block' : 'none'; bd.textContent = active.length;

  const groups = barbers.filter(b => b.active || active.some(x => x.barber_id === b.id));
  if (active.some(x => !x.barber_id)) groups.push({ id: null, name: 'بدون حلاق' });
  if (!groups.length) { $('board').innerHTML = '<div class="q-empty">أضف حلاقين من تبويب «الحلاقين» الأول</div>'; return; }

  $('board').innerHTML = groups.map(g => {
    const list = active.filter(x => x.barber_id === g.id);
    const wait = list.reduce((s, x) => s + remaining(x), 0);
    return `<div class="col">
      <div class="col-h"><b>💈 ${esc(g.name)}</b><span>${list.length} في الانتظار · ${list.length ? 'يخلص بعد ' + durTxt(wait) : 'متاح'}</span></div>
      <div class="col-b">${list.length ? list.map(qItem).join('') : '<div class="q-empty">لا يوجد أحد في الانتظار</div>'}</div></div>`;
  }).join('');
}

function qItem(b) {
  const names = (b.items || []).map(i => esc(i.name)).join(' + ');
  const acts = b.status === 'waiting'
    ? `<button class="btn btn-green btn-sm" onclick="setStatus(${b.id},'in_service')">▶ ابدأ</button>
       <button class="btn btn-red btn-sm" onclick="setStatus(${b.id},'cancelled')">✕</button>
       <button class="btn btn-line btn-sm" onclick="setStatus(${b.id},'no_show')">ما جاش</button>`
    : `<button class="btn btn-green btn-sm" onclick="setStatus(${b.id},'done')">✓ تم</button>`;
  return `<div class="q-item ${b.status}">
    <div class="q-no">#${b.ticket_no}</div>
    <div class="q-body"><b>${esc(b.customer_name)}</b>${b.customer_phone && b.customer_phone !== '—' ? `<a href="tel:${esc(b.customer_phone)}">${esc(b.customer_phone)}</a>` : ''}
      <div class="mut">${names}</div>
      <div class="mut">⏱ ${durTxt(b.duration_min)} · <span class="gold">${EGP(b.price)}</span> · حجز ${tm(b.created_at)}</div>
      ${b.notes ? `<div class="mut">📝 ${esc(b.notes)}</div>` : ''}</div>
    <div class="q-act">${acts}</div></div>`;
}

window.setStatus = async (id, status) => {
  const patch = { status };
  if (status === 'in_service') patch.started_at = new Date().toISOString();
  const { error } = await sb.from('bookings').update(patch).eq('id', id);
  if (error) { toast('تعذر التحديث', 'err'); return; }
  toast(status === 'done' ? 'تم ✓' : status === 'in_service' ? 'بدأت الخدمة' : 'تم التحديث', 'ok');
  loadToday();
};
$('btnRefresh').addEventListener('click', loadAll);

/* ══ WALK-IN ══ */
$('btnWalk').addEventListener('click', () => {
  $('wName').value = ''; $('wPhone').value = '';
  $('wBarber').innerHTML = '<option value="">الأسرع (تلقائي)</option>' + barbers.filter(b => b.active).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  $('wPack').innerHTML = '<option value="">— بدون —</option>' + packages.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)} (${EGP(p.price)})</option>`).join('');
  $('wServices').innerHTML = services.filter(s => s.active).map(s => `<label><input type="checkbox" value="${s.id}"/> ${esc(s.name)} — ${EGP(s.price)} · ${durTxt(s.duration_min)}</label>`).join('');
  openMo('moWalk');
});
$('btnSaveWalk').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#wServices input:checked')].map(i => Number(i.value));
  const pack = $('wPack').value ? Number($('wPack').value) : null;
  if (!pack && !ids.length) { toast('اختار خدمة أو باكدج', 'err'); return; }
  const { error } = await sb.rpc('create_booking', {
    p_name: $('wName').value.trim() || 'عميل بالمحل', p_phone: $('wPhone').value.trim() || '—',
    p_barber: $('wBarber').value ? Number($('wBarber').value) : null,
    p_service_ids: pack ? [] : ids, p_package_id: pack, p_notes: null,
  });
  if (error) { toast(error.message, 'err', 4500); return; }
  closeMo('moWalk'); toast('تمت الإضافة للطابور ✓', 'ok'); loadToday();
});

/* ══ HISTORY ══ */
async function loadHistory() {
  if (!$('histDate').value) $('histDate').value = todayStr();
  const { data } = await sb.from('bookings').select('*').eq('booking_date', $('histDate').value).order('id');
  const list = data || [];
  histRows = list;
  const done = list.filter(b => b.status === 'done');
  $('hTot').textContent = list.length; $('hDone').textContent = done.length;
  $('hCan').textContent = list.filter(b => ['cancelled', 'no_show'].includes(b.status)).length;
  $('hRev').textContent = EGP(done.reduce((s, b) => s + Number(b.price), 0));
  $('histBody').innerHTML = list.length ? list.map(b => `<tr>
    <td>#${b.ticket_no}</td>
    <td><b>${esc(b.customer_name)}</b><div class="mut" style="direction:ltr;text-align:right">${esc(b.customer_phone)}</div></td>
    <td>${esc(b.barber_name || '—')}</td>
    <td>${(b.items || []).map(i => esc(i.name)).join(' + ')}</td>
    <td>${durTxt(b.duration_min)}</td><td class="gold">${EGP(b.price)}</td>
    <td><span class="st ${b.status}">${STATUS[b.status]}</span></td></tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--ink3)">لا توجد حجوزات في اليوم ده</td></tr>';
}
let histRows = [];
$('histDate').addEventListener('change', loadHistory);
$('btnCsv').addEventListener('click', () => {
  if (!histRows.length) { toast('لا توجد بيانات', 'err'); return; }
  const rows = histRows.map(b => [b.ticket_no, b.customer_name, b.customer_phone, b.barber_name || '', (b.items || []).map(i => i.name).join(' + '), b.duration_min, b.price, STATUS[b.status]]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = '\uFEFF' + ['#,العميل,الهاتف,الحلاق,الخدمة,المدة,السعر,الحالة', ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `bookings-${$('histDate').value}.csv`; a.click();
});

/* ══ CRUD: barbers / services / packages ══ */
const CFG = {
  barbers: { label: 'حلاق', fields: [['name', 'الاسم', 'text', 1], ['specialty', 'التخصص (اختياري)', 'text'], ['photo_url', 'رابط الصورة (اختياري)', 'text'], ['sort', 'الترتيب', 'number']],
    row: r => `<td><b>${esc(r.name)}</b><div class="mut">${esc(r.specialty || '')}</div></td>` },
  services: { label: 'خدمة', fields: [['name', 'اسم الخدمة', 'text', 1], ['price', 'السعر (جنيه)', 'number', 1], ['duration_min', 'الوقت التقديري (دقيقة)', 'number', 1], ['sort', 'الترتيب', 'number']],
    row: r => `<td><b>${esc(r.name)}</b></td><td class="gold">${EGP(r.price)}</td><td>${durTxt(r.duration_min)}</td>` },
  packages: { label: 'باكدج', fields: [['name', 'اسم الباكدج', 'text', 1], ['description', 'الوصف (إيه اللي فيه)', 'text'], ['price', 'السعر (جنيه)', 'number', 1], ['old_price', 'السعر قبل الخصم (اختياري)', 'number'], ['duration_min', 'الوقت التقديري (دقيقة)', 'number', 1]],
    row: r => `<td><b>${esc(r.name)}</b><div class="mut">${esc(r.description || '')}</div></td><td class="gold">${EGP(r.price)}${r.old_price ? ` <s class="mut">${EGP(r.old_price)}</s>` : ''}</td><td>${durTxt(r.duration_min)}</td>` },
};
const DATA = () => ({ barbers, services, packages });

function renderLists() {
  for (const key of Object.keys(CFG)) {
    const list = DATA()[key];
    $('list-' + key).innerHTML = list.length ? list.map(r => `<tr>${CFG[key].row(r)}
      <td><input type="checkbox" class="tog" ${r.active ? 'checked' : ''} onchange="toggleActive('${key}',${r.id},this.checked)"/></td>
      <td class="r"><button class="btn btn-line btn-sm" onclick="editItem('${key}',${r.id})">✏️ تعديل</button>
        <button class="btn btn-red btn-sm" onclick="delItem('${key}',${r.id})">🗑</button></td></tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink3)">لا يوجد — أضف أول ${CFG[key].label}</td></tr>`;
  }
}
window.toggleActive = async (key, id, v) => {
  const { error } = await sb.from(key).update({ active: v }).eq('id', id);
  if (error) { toast('تعذر التحديث', 'err'); return; }
  DATA()[key].find(r => r.id === id).active = v; toast(v ? 'تم الإظهار' : 'تم الإخفاء');
};
window.delItem = async (key, id) => {
  if (!confirm('متأكد من الحذف؟ (الأفضل تخفيه بدل ما تحذفه)')) return;
  const { error } = await sb.from(key).delete().eq('id', id);
  if (error) { toast('تعذر الحذف', 'err'); return; }
  toast('تم الحذف'); loadAll();
};

let editing = null;
window.editItem = (key, id) => {
  const cfg = CFG[key], row = id ? DATA()[key].find(r => r.id === id) : null;
  editing = { key, id };
  $('itemTitle').textContent = (row ? 'تعديل ' : 'إضافة ') + cfg.label;
  $('itemFields').innerHTML = cfg.fields.map(([k, l, t, req]) =>
    `<div class="fg"><label>${l}${req ? ' *' : ''}</label><input data-k="${k}" type="${t}" ${t === 'number' ? 'min="0" step="any"' : ''} value="${esc(row ? row[k] ?? '' : (k === 'sort' ? 0 : ''))}"/></div>`).join('');
  openMo('moItem');
};
$('btnSaveItem').addEventListener('click', async () => {
  const { key, id } = editing, cfg = CFG[key], payload = {};
  for (const [k, l, t, req] of cfg.fields) {
    const raw = document.querySelector(`#itemFields [data-k="${k}"]`).value.trim();
    if (req && !raw) { toast(`${l} مطلوب`, 'err'); return; }
    payload[k] = t === 'number' ? (raw === '' ? null : Number(raw)) : (raw || null);
  }
  if ('sort' in payload && payload.sort === null) payload.sort = 0;
  if (payload.duration_min !== undefined && payload.duration_min < 1) { toast('الوقت لازم يكون دقيقة على الأقل', 'err'); return; }
  const q = id ? sb.from(key).update(payload).eq('id', id) : sb.from(key).insert([payload]);
  const { error } = await q;
  if (error) { toast('خطأ: ' + error.message, 'err', 4500); return; }
  closeMo('moItem'); toast('تم الحفظ ✓', 'ok'); loadAll();
});

/* ══ SETTINGS ══ */
function renderSettings() {
  $('setName').value = settings.shop_name || '';
  $('setWa').value = settings.whatsapp || '';
  $('setAcc').checked = settings.accepting !== 'false';
}
$('btnSaveSet').addEventListener('click', async () => {
  const rows = [
    { key: 'shop_name', value: $('setName').value.trim() || 'Barber Shop' },
    { key: 'whatsapp', value: $('setWa').value.trim() },
    { key: 'accepting', value: $('setAcc').checked ? 'true' : 'false' },
  ];
  const { error } = await sb.from('settings').upsert(rows);
  if (error) { toast('تعذر الحفظ', 'err'); return; }
  toast('تم حفظ الإعدادات ✓', 'ok'); loadAll();
});

/* ══ INIT ══ */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { $('loginScreen').style.display = 'none'; start(); }
  else $('loginUser').focus();
})();
