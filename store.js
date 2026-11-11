/* ═══════════════════════════════════════
   ONLINE MARKET — store.js (customer page)
═══════════════════════════════════════ */
const SB_URL = 'https://aweuqtiqfxjoflvvturi.supabase.co';
const SB_KEY = 'sb_publishable_DIHyv13-yCxgBKIC8PYCvQ_394bcWSE';
const sb = supabase.createClient(SB_URL, SB_KEY);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EGP = v => `${Number(v).toLocaleString('ar-EG')} جنيه`;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const STATUS = { new: 'تم استلام الطلب', preparing: 'قيد التحضير', delivering: 'في الطريق إليك', delivered: 'تم التسليم', cancelled: 'ملغي' };
const STEPS = ['new', 'preparing', 'delivering', 'delivered'];
const tm = s => new Date(s).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });

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
let categories = [], products = [], offers = [], settings = {};
let cart = {};                       // "product:5" -> { type, id, qty }
let activeCat = 'all', query = '';
let geo = null, payMethod = 'cash';

const getItem = (type, id) => type === 'offer' ? offers.find(x => x.id === id) : products.find(x => x.id === id);
const itemName = it => it.title || it.name;
const isAvail = (type, it) => type === 'offer' ? true : it.available;

/* ══ LOAD ══ */
async function loadAll() {
  const [c, p, o, s] = await Promise.all([
    sb.from('mk_categories').select('*').eq('active', true).order('sort').order('id'),
    sb.from('mk_products').select('*').eq('active', true).order('sort').order('id'),
    sb.from('mk_offers').select('*').eq('active', true).order('sort').order('id'),
    sb.from('mk_settings').select('*'),
  ]);
  if (c.error || p.error) {
    console.error('load error', c.error || p.error);
    $('prods').innerHTML = '<div class="empty">الخدمة غير متاحة حالياً.<br>يرجى المحاولة بعد قليل أو التواصل معنا مباشرة.</div>';
    return;
  }
  categories = c.data || []; products = p.data || []; offers = o.data || [];
  settings = Object.fromEntries((s.data || []).map(r => [r.key, r.value]));
  applySettings();
  loadCart();
  renderAll();
}

function applySettings() {
  const n = settings.shop_name || 'المتجر';
  $('shopName').textContent = n; $('shopName2').textContent = n; document.title = n;
  $('closedBanner').style.display = settings.accepting === 'false' ? 'block' : 'none';
  const wa = (settings.whatsapp || '').replace(/\D/g, '');
  $('waLink').classList.toggle('hide', !wa);
  if (wa) $('waLink').href = 'https://wa.me/' + wa;
  $('walletName').textContent = settings.wallet_name || 'المحفظة';
  $('walletNum').textContent = settings.wallet_number || '';
}

function renderAll() { renderChips(); renderOffers(); renderProducts(); renderBar(); if ($('moCart').classList.contains('open')) renderCart(); }

/* ══ RENDER ══ */
function renderChips() {
  const used = new Set(products.map(p => p.category_id));
  const cats = categories.filter(c => used.has(c.id));
  $('chips').innerHTML = [`<button class="chip ${activeCat === 'all' ? 'on' : ''}" data-c="all">الكل</button>`]
    .concat(cats.map(c => `<button class="chip ${activeCat === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`)).join('');
}

function ctrl(type, id, avail) {
  if (!avail) return '<span class="na">غير متاح</span>';
  const qty = (cart[`${type}:${id}`] || {}).qty || 0;
  return qty
    ? `<div class="step"><button onclick="chg('${type}',${id},1)">+</button><span>${qty}</span><button onclick="chg('${type}',${id},-1)">−</button></div>`
    : `<button class="btn btn-gold btn-sm" onclick="chg('${type}',${id},1)">إضافة</button>`;
}
const priceBlock = it => `<div class="pc-price">${EGP(it.price)}${it.old_price && Number(it.old_price) > Number(it.price) ? `<span class="old">${EGP(it.old_price)}</span>` : ''}</div>`;
const discTag = it => it.old_price && Number(it.old_price) > Number(it.price) ? `<span class="tag">خصم ${Math.round((1 - it.price / it.old_price) * 100)}%</span>` : '';
const imgHtml = (it, alt) => it.image_url ? `<img src="${esc(it.image_url)}" alt="${esc(alt)}" loading="lazy"/>` : '<span>بدون صورة</span>';

function renderOffers() {
  $('offersSec').classList.toggle('hide', !offers.length);
  $('offers').innerHTML = offers.map(o => `<div class="of-card">
    <div class="of-img">${imgHtml(o, o.title)}${discTag(o)}</div>
    <div class="pc-body"><div class="pc-name">${esc(o.title)}</div><div class="pc-desc">${esc(o.description || '')}</div>
      <div class="pc-row">${priceBlock(o)}${ctrl('offer', o.id, true)}</div></div></div>`).join('');
}

function renderProducts() {
  const q = query.trim().toLowerCase();
  const list = products.filter(p => (activeCat === 'all' || p.category_id === activeCat)
    && (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)));
  const cat = categories.find(c => c.id === activeCat);
  $('prodTitle').textContent = q ? 'نتائج البحث' : cat ? cat.name : 'المنتجات';
  $('prods').innerHTML = list.length ? list.map(p => `<div class="pc">
    <div class="pc-img">${imgHtml(p, p.name)}${discTag(p)}</div>
    <div class="pc-body"><div class="pc-name">${esc(p.name)}</div><div class="pc-desc">${esc(p.description || '')}</div>
      <div class="pc-row">${priceBlock(p)}${ctrl('product', p.id, p.available)}</div></div></div>`).join('')
    : '<div class="empty">لا توجد منتجات</div>';
}

$('chips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  activeCat = b.dataset.c === 'all' ? 'all' : Number(b.dataset.c);
  renderChips(); renderProducts();
});
$('search').addEventListener('input', e => { query = e.target.value; renderProducts(); });

/* ══ CART ══ */
function saveCart() { ls.set('mk_cart', JSON.stringify(cart)); }
function loadCart() {
  let saved = {};
  try { saved = JSON.parse(ls.get('mk_cart') || '{}') || {}; } catch (e) {}
  cart = {};
  for (const [k, c] of Object.entries(saved)) {
    const it = c && getItem(c.type, c.id);
    if (it && isAvail(c.type, it) && c.qty > 0) cart[k] = { type: c.type, id: c.id, qty: Math.min(50, c.qty) };
  }
  saveCart();
}
window.chg = (type, id, d) => {
  const k = `${type}:${id}`, cur = cart[k] ? cart[k].qty : 0, n = Math.min(50, cur + d);
  if (n <= 0) delete cart[k]; else cart[k] = { type, id, qty: n };
  saveCart(); renderOffers(); renderProducts(); renderBar();
  if ($('moCart').classList.contains('open')) renderCart();
};
function totals() {
  let sub = 0, count = 0;
  Object.values(cart).forEach(c => { const it = getItem(c.type, c.id); if (it) { sub += Number(it.price) * c.qty; count += c.qty; } });
  const base = Number(settings.delivery_fee) || 0, free = Number(settings.free_over) || 0, min = Number(settings.min_order) || 0;
  const fee = count && !(free > 0 && sub >= free) ? base : 0;
  return { sub, count, fee, total: sub + fee, min };
}
function renderBar() {
  const t = totals();
  $('cartCount').textContent = t.count;
  $('cartBar').classList.toggle('hide', !t.count);
  $('barCount').textContent = t.count;
  $('barTotal').textContent = EGP(t.sub);
}

function renderCart() {
  const t = totals();
  const rows = Object.values(cart).map(c => ({ c, it: getItem(c.type, c.id) })).filter(x => x.it);
  $('cartItems').innerHTML = rows.length ? rows.map(({ c, it }) => `<div class="ci">
      <div class="avatar" style="width:44px;height:44px">${it.image_url ? `<img src="${esc(it.image_url)}" alt=""/>` : ''}</div>
      <div class="ci-info"><div class="ci-name">${esc(itemName(it))}</div><div class="ci-price">${EGP(it.price)} × ${c.qty} = ${EGP(it.price * c.qty)}</div></div>
      <div class="step"><button onclick="chg('${c.type}',${c.id},1)">+</button><span>${c.qty}</span><button onclick="chg('${c.type}',${c.id},-1)">−</button></div></div>`).join('')
    : '<div class="empty">السلة فارغة</div>';
  $('sSub').textContent = EGP(t.sub);
  $('sFee').textContent = !t.count ? '—' : t.fee ? EGP(t.fee) : 'مجاني';
  $('sTot').textContent = EGP(t.total);
  $('wAmt').textContent = EGP(t.total);
  const short = t.count && t.sub < t.min;
  $('minWarn').classList.toggle('hide', !short);
  if (short) $('minWarn').textContent = `الحد الأدنى للطلب ${EGP(t.min)}، أضف منتجات بقيمة ${EGP(t.min - t.sub)} لإتمام الطلب.`;
  $('placeBtn').disabled = !t.count || short || settings.accepting === 'false';
  renderPay();
}

function payOptions() {
  const o = [];
  if (settings.cash_enabled !== 'false') o.push({ k: 'cash', t: 'الدفع نقداً عند الاستلام' });
  if (settings.wallet_enabled !== 'false' && settings.wallet_number) o.push({ k: 'wallet', t: `الدفع بالمحفظة (${settings.wallet_name || 'محفظة إلكترونية'})` });
  return o;
}
function renderPay() {
  const opts = payOptions();
  if (!opts.some(o => o.k === payMethod)) payMethod = opts.length ? opts[0].k : 'cash';
  $('payOpts').innerHTML = opts.map(o => `<label class="opt ${payMethod === o.k ? 'on' : ''}"><input type="radio" name="pay" value="${o.k}" ${payMethod === o.k ? 'checked' : ''}/>${esc(o.t)}</label>`).join('')
    || '<div class="warn">لا توجد وسيلة دفع متاحة حالياً.</div>';
  $('walletBox').classList.toggle('hide', payMethod !== 'wallet');
}
$('payOpts').addEventListener('change', e => { if (e.target.name === 'pay') { payMethod = e.target.value; renderPay(); } });
$('copyNum').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(settings.wallet_number || ''); toast('تم نسخ الرقم', 'ok'); }
  catch (e) { toast('انسخ الرقم يدوياً'); }
});

function openCart() {
  $('cName').value = $('cName').value || ls.get('mk_name') || '';
  $('cPhone').value = $('cPhone').value || ls.get('mk_phone') || '';
  $('cAddr').value = $('cAddr').value || ls.get('mk_addr') || '';
  renderCart(); openMo('moCart');
}
$('cartBtn').addEventListener('click', openCart);
$('barBtn').addEventListener('click', openCart);

/* ── Location ── */
function showGeo() {
  $('locState').innerHTML = geo
    ? `تم تحديد موقعك · <a href="https://www.google.com/maps?q=${geo.lat},${geo.lng}" target="_blank" rel="noopener">عرض على الخريطة</a> · <a href="#" id="locClear">إزالة</a>`
    : 'لم يتم تحديد الموقع (اختياري)';
}
$('locState').addEventListener('click', e => { if (e.target.id === 'locClear') { e.preventDefault(); geo = null; showGeo(); } });
$('locBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('المتصفح لا يدعم تحديد الموقع', 'err'); return; }
  $('locBtn').disabled = true; $('locState').textContent = 'جاري تحديد الموقع...';
  navigator.geolocation.getCurrentPosition(pos => {
    geo = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
    $('locBtn').disabled = false; showGeo();
  }, err => {
    $('locBtn').disabled = false; showGeo();
    toast(err && err.code === 1 ? 'تم رفض إذن الموقع، اكتب عنوانك يدوياً' : 'تعذر تحديد الموقع، حاول مرة أخرى', 'err', 4000);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

/* ══ PLACE ORDER ══ */
$('placeBtn').addEventListener('click', async () => {
  const t = totals(); if (!t.count) return;
  const name = $('cName').value.trim();
  const phone = $('cPhone').value.replace(/[\s-]/g, '');
  let addr = $('cAddr').value.trim();
  const ref = $('walletRef').value.replace(/[\s-]/g, '');
  if (!name) { toast('أدخل الاسم', 'err'); $('cName').focus(); return; }
  if (!/^\+?\d{10,14}$/.test(phone)) { toast('رقم الهاتف غير صحيح', 'err'); $('cPhone').focus(); return; }
  if (!addr && geo) addr = 'الموقع المحدد على الخريطة';
  if (!addr) { toast('أدخل العنوان أو حدد موقعك', 'err'); $('cAddr').focus(); return; }
  if (payMethod === 'wallet' && !/^\+?\d{10,14}$/.test(ref)) { toast('أدخل رقم المحفظة المحوَّل منها', 'err'); $('walletRef').focus(); return; }

  const items = Object.values(cart).filter(c => getItem(c.type, c.id)).map(({ type, id, qty }) => ({ type, id, qty }));
  const btn = $('placeBtn'); btn.disabled = true; btn.textContent = 'جاري إرسال الطلب...';
  const { data, error } = await sb.rpc('mk_create_order', {
    p_name: name, p_phone: phone, p_address: addr,
    p_lat: geo ? geo.lat : null, p_lng: geo ? geo.lng : null,
    p_notes: $('cNotes').value.trim() || null,
    p_payment: payMethod, p_wallet_ref: payMethod === 'wallet' ? ref : null,
    p_items: items,
  });
  btn.textContent = 'تأكيد الطلب';
  if (error) {
    console.error('order error', error);
    toast(error.code === 'P0001' ? error.message : 'حدث خطأ، حاول مرة أخرى', 'err', 5000);
    renderCart(); return;
  }

  ls.set('mk_name', name); ls.set('mk_phone', phone); ls.set('mk_addr', $('cAddr').value.trim());
  cart = {}; saveCart(); $('cNotes').value = ''; $('walletRef').value = '';
  closeMo('moCart'); renderOffers(); renderProducts(); renderBar();

  $('dNo').textContent = `#${data.order_no}`;
  $('dInfo').innerHTML = `المنتجات: ${EGP(data.subtotal)}<br>التوصيل: ${data.delivery_fee > 0 ? EGP(data.delivery_fee) : 'مجاني'}<br><b>الإجمالي: ${EGP(data.total)}</b><br>`
    + (data.payment_method === 'wallet' ? 'الدفع: بالمحفظة (بانتظار تأكيد المتجر)' : 'الدفع: نقداً عند الاستلام');
  $('trkPhone').value = phone;
  openMo('moDone');
});

/* ══ TRACK ══ */
let trkTimer = null;
function openTrack() {
  if (!$('trkPhone').value) $('trkPhone').value = ls.get('mk_phone') || '';
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
  const { data, error } = await sb.rpc('mk_track_orders', { p_phone: phone });
  if (error) { toast('تعذر جلب الطلبات', 'err'); return; }
  ls.set('mk_phone', phone);
  $('trkList').innerHTML = data.length ? data.map(o => {
    const idx = STEPS.indexOf(o.status);
    const pay = o.payment_method === 'wallet' ? (o.payment_status === 'paid' ? 'محفظة · تم تأكيد الدفع' : 'محفظة · بانتظار تأكيد الدفع') : 'نقداً عند الاستلام';
    return `<div class="trk">
      <div class="trk-top"><b>طلب #${o.order_no} <span class="mut">${tm(o.created_at)}</span></b><span class="st ${o.status}">${STATUS[o.status]}</span></div>
      ${o.status === 'cancelled' ? '' : `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>`}
      <ul>${(o.items || []).map(i => `<li><span>${i.qty} × ${esc(i.name)}</span><span>${EGP(i.price * i.qty)}</span></li>`).join('')}</ul>
      <div class="mut">التوصيل: ${o.delivery_fee > 0 ? EGP(o.delivery_fee) : 'مجاني'} · ${pay}</div>
      <div style="margin-top:4px"><b>الإجمالي: ${EGP(o.total)}</b></div>
      ${o.status === 'new' ? `<button class="btn btn-red btn-sm" style="margin-top:8px" onclick="cancelOrder(${o.id})">إلغاء الطلب</button>` : ''}
    </div>`;
  }).join('') : '<div class="empty" style="padding:22px 0 6px">لا توجد طلبات حديثة على هذا الرقم</div>';

  clearInterval(trkTimer);
  trkTimer = setInterval(() => { $('moTrack').classList.contains('open') ? track() : clearInterval(trkTimer); }, 20000);
}
window.cancelOrder = async id => {
  if (!confirm('هل تريد إلغاء الطلب؟')) return;
  const { data } = await sb.rpc('mk_cancel_order', { p_id: id, p_phone: $('trkPhone').value.replace(/[\s-]/g, '') });
  toast(data ? 'تم إلغاء الطلب' : 'لا يمكن إلغاء الطلب الآن، تواصل مع المتجر', data ? 'ok' : 'err', 4000);
  track();
};

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded', () => {
  $('yr').textContent = new Date().getFullYear();
  loadAll();
});
