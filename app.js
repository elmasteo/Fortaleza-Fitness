// =====================================================
//  FORTALEZA FITNESS — APP.JS
//  Persistencia: Supabase (primario) + localStorage (fallback)
// =====================================================

// ===== PLANES =====
// Tipos de plan:
//   type: 'time'   → acceso por días (expiryDate controla el vencimiento)
//   type: 'clases' → paquete de clases (classesLeft controla el saldo)
const PLANS = {
  clase:        { name: 'Clase Individual',  price: 20000,  type: 'clases', classes: 1,  label: '$20.000/clase' },
  paquete12:    { name: '12 Clases',         price: 120000, type: 'clases', classes: 12, label: '$120.000/12 clases' },
  paquete15:    { name: '15 Clases',         price: 140000, type: 'clases', classes: 15, label: '$140.000/15 clases' },
  mesIlimitado: { name: 'Mes Ilimitado',     price: 160000, type: 'time',   months: 1,   label: '$160.000/mes' },
  seven:        { name: 'Seven (Alto Rendimiento)', price: 180000, type: 'time', months: 1, label: '$180.000/mes' },
};

// ===== ESTADO LOCAL =====
let state = { members: [], payments: [], checkins: [], currentMemberId: null };

// ===== AUTENTICACIÓN ADMIN =====
// La contraseña se guarda hasheada en config.js como ADMIN_PASSWORD_HASH
// Para generarla: en la consola del navegador ejecuta sha256('tu-contraseña')
// O usa el helper incluido más abajo.
let adminSession = false; // true cuando el admin ha autenticado en esta sesión

// ===== SUPABASE CLIENT =====
let db = null;
let useSupabase = false;

function initSupabase() {
  try {
    if (
      typeof supabase === 'undefined' ||
      !SUPABASE_URL || SUPABASE_URL.includes('TU_PROJECT_ID') ||
      !SUPABASE_ANON || SUPABASE_ANON.includes('TU_ANON')
    ) {
      setDbStatus('local', 'Modo local (sin BD)');
      return false;
    }
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    useSupabase = true;
    return true;
  } catch (e) {
    console.warn('Supabase init error:', e);
    setDbStatus('offline', 'Error de conexión');
    return false;
  }
}

function setDbStatus(state, text) {
  const dot  = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  if (dot)  { dot.className = 'status-dot-db ' + state; }
  if (span) span.textContent = text;
}

// =====================================================
//  CAPA DE DATOS — abstrae Supabase ↔ localStorage
// =====================================================

// --- Guardar en localStorage (siempre como backup) ---
function saveLocal() {
  try { localStorage.setItem('fortalezaData', JSON.stringify(state)); } catch (_) {}
}

function loadLocal() {
  try {
    const d = localStorage.getItem('fortalezaData');
    if (d) { const p = JSON.parse(d); state = { ...state, ...p }; }
  } catch (_) {}
}

// --- CARGAR TODOS LOS DATOS ---
async function loadAll() {
  if (!useSupabase) {
    loadLocal();
    setDbStatus('local', 'Modo local');
    return;
  }
  try {
    setDbStatus('local', 'Cargando...');
    const [{ data: members }, { data: payments }, { data: checkins }] = await Promise.all([
      db.from('members').select('*').order('created_at', { ascending: false }),
      db.from('payments').select('*').order('pay_date',   { ascending: false }),
      db.from('checkins').select('*').order('timestamp',  { ascending: false }),
    ]);
    state.members  = (members  || []).map(fromSupabaseMember);
    state.payments = (payments || []).map(fromSupabasePayment);
    state.checkins = (checkins || []).map(fromSupabaseCheckin);
    saveLocal();
    setDbStatus('online', 'Supabase conectado');
  } catch (e) {
    console.warn('Supabase load error, using local:', e);
    loadLocal();
    setDbStatus('offline', 'BD offline — local');
  }
}

// --- MAPPERS: base de datos → estado local ---
function fromSupabaseMember(r) {
  return {
    id: r.id, name: r.name, cedula: r.cedula, phone: r.phone || '',
    email: r.email || '', plan: r.plan, startDate: r.start_date,
    expiryDate: r.expiry_date, notes: r.notes || '',
    createdAt: r.created_at?.slice(0, 10), lastCheckin: r.last_checkin || null,
    classesLeft: r.classes_left ?? null,
    disabled: r.disabled ?? false,
    photo: r.photo ?? null,
    stats: r.stats ? (typeof r.stats === 'string' ? JSON.parse(r.stats) : r.stats) : {},
    statsHistory: r.stats_history ? (typeof r.stats_history === 'string' ? JSON.parse(r.stats_history) : r.stats_history) : [],
  };
}
function fromSupabasePayment(r) {
  return {
    id: r.id, memberId: r.member_id, memberName: r.member_name, plan: r.plan,
    amount: r.amount, payDate: r.pay_date, expiryDate: r.expiry_date,
    method: r.method, status: r.status,
  };
}
function fromSupabaseCheckin(r) {
  return {
    id: r.id, memberId: r.member_id, memberName: r.member_name,
    plan: r.plan, timestamp: r.timestamp, overdue: r.overdue,
  };
}

// --- GUARDAR MIEMBRO ---
async function persistMember(member) {
  if (!useSupabase) { saveLocal(); return; }
  const row = {
    id: member.id, name: member.name, cedula: member.cedula,
    phone: member.phone, email: member.email, plan: member.plan,
    start_date: member.startDate, expiry_date: member.expiryDate,
    notes: member.notes, last_checkin: member.lastCheckin,
    classes_left: member.classesLeft ?? null,
    disabled: member.disabled ?? false,
    photo: member.photo ?? null,
    stats: member.stats ? JSON.stringify(member.stats) : null,
    stats_history: member.statsHistory ? JSON.stringify(member.statsHistory) : null,
  };
  const { error } = await db.from('members').upsert(row);
  if (error) { console.error('persist member:', error); saveLocal(); }
  else saveLocal();
}

// --- GUARDAR PAGO ---
async function persistPayment(payment) {
  if (!useSupabase) { saveLocal(); return; }
  const row = {
    id: payment.id, member_id: payment.memberId, member_name: payment.memberName,
    plan: payment.plan, amount: payment.amount, pay_date: payment.payDate,
    expiry_date: payment.expiryDate, method: payment.method, status: payment.status,
  };
  const { error } = await db.from('payments').upsert(row);
  if (error) { console.error('persist payment:', error); saveLocal(); }
  else saveLocal();
}

// --- GUARDAR CHECK-IN ---
async function persistCheckin(checkin) {
  if (!useSupabase) { saveLocal(); return; }
  const row = {
    id: checkin.id, member_id: checkin.memberId, member_name: checkin.memberName,
    plan: checkin.plan, timestamp: checkin.timestamp, overdue: checkin.overdue,
  };
  const { error } = await db.from('checkins').insert(row);
  if (error) { console.error('persist checkin:', error); saveLocal(); }
  else saveLocal();
}

// --- ELIMINAR MIEMBRO ---
async function deleteMemberFromDB(id) {
  if (!useSupabase) { saveLocal(); return; }
  await db.from('checkins').delete().eq('member_id', id);
  await db.from('payments').delete().eq('member_id', id);
  const { error } = await db.from('members').delete().eq('id', id);
  if (error) console.error('delete member:', error);
  else saveLocal();
}

// =====================================================
//  UTILIDADES
// =====================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function initials(name) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}
function formatDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  // Use local date parts to avoid UTC shift
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
// Devuelve la fecha local como "YYYY-MM-DD" (sin depender de UTC)
function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// Devuelve timestamp en hora local como "YYYY-MM-DDTHH:MM:SS"
// Evita el desfase UTC-5 de Colombia que produce toISOString()
function localISOString() {
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function isOverdue(exp) { return exp < today(); }
function daysUntil(s) {
  return Math.ceil((new Date(s + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 3400);
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    const n = new Date();
    el.textContent = [n.getHours(), n.getMinutes(), n.getSeconds()]
      .map(v => String(v).padStart(2, '0')).join(':');
  }
}

// =====================================================
//  AUTENTICACIÓN ADMIN
// =====================================================

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function isAdmin() { return adminSession; }

function requireAdmin(callback) {
  if (adminSession) { callback(); return; }
  openModal('adminAuthModal');
  // Store callback to call after successful login
  window._pendingAdminAction = callback;
}

async function submitAdminLogin() {
  const pwd    = document.getElementById('adminPwd').value;
  const errEl  = document.getElementById('adminAuthError');
  if (!pwd) { errEl.textContent = 'Ingresa la contraseña'; return; }

  const hash   = await sha256(pwd);
  const stored = (typeof ADMIN_PASSWORD_HASH !== 'undefined') ? ADMIN_PASSWORD_HASH : null;

  // If no hash configured, accept "admin1234" as default (warn user)
  const defaultHash = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'; // sha256('admin1234')

  if (!stored || stored === defaultHash) {
    if (stored !== defaultHash) {
      errEl.textContent = '⚠ Usando contraseña por defecto. Configura ADMIN_PASSWORD_HASH en config.js';
    }
  }

  const validHash = stored || defaultHash;
  if (hash !== validHash) {
    errEl.textContent = '❌ Contraseña incorrecta';
    document.getElementById('adminPwd').value = '';
    document.getElementById('adminPwd').focus();
    return;
  }

  adminSession = true;
  errEl.textContent = '';
  document.getElementById('adminPwd').value = '';
  closeModal('adminAuthModal');
  updateAdminUI();

  // Execute pending action
  if (window._pendingAdminAction) {
    const action = window._pendingAdminAction;
    window._pendingAdminAction = null;
    action();
  }
}

function adminLogout() {
  adminSession = false;
  updateAdminUI();
  showToast('Sesión admin cerrada');
  // Si estaba en sección protegida, redirigir al dashboard
  const active = document.querySelector('.nav-item.active');
  if (active && ['payments'].includes(active.dataset.section)) {
    showSection('dashboard');
  }
}

// Actualiza toda la UI según el estado admin (se llama al login y logout)
function updateAdminUI() {
  const admin = isAdmin();

  // Nav Pagos: oculto sin admin
  const navPay = document.getElementById('navPayments');
  if (navPay) navPay.style.display = admin ? '' : 'none';

  // Dashboard cards admin-only: toggle explícito
  ['card-revenue', 'card-overdue', 'card-expiring'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = admin ? 'block' : 'none';
  });

  // Re-renderizar dashboard para reflejar datos frescos
  renderDashboard();
}

// =====================================================
//  NAVEGACIÓN
// =====================================================
function showSection(name) {
  // Sección protegida: redirigir si no hay admin
  if (name === 'payments' && !isAdmin()) {
    requireAdmin(() => showSection('payments'));
    return;
  }
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');
  const titles = { dashboard:'Dashboard', members:'Miembros', payments:'Pagos', checkin:'Check-In', plans:'Planes', admin:'Admin' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'dashboard') renderDashboard();
  if (name === 'members')   renderMembers();
  if (name === 'payments')  renderPayments();
  if (name === 'checkin')   { renderTodayCheckins(); renderGymHoursBanner(); }
  if (name === 'admin')     renderAdminSection();
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// =====================================================
//  MODALES
// =====================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// =====================================================
//  NEQUI / BRE-B MODAL
// =====================================================
function openNequiModal(plan, price) {
  const p = PLANS[plan];
  document.getElementById('nequiPlanInfo').innerHTML = `
    <div class="nequi-plan-name">${p.name.toUpperCase()}</div>
    <div class="nequi-plan-price">${formatCOP(price)}</div>
  `;
  const num = (typeof NEQUI_NUMBER !== 'undefined') ? NEQUI_NUMBER : '— configura config.js —';
  document.getElementById('nequiNumberDisplay').textContent  = num;
  document.getElementById('brebNumberDisplay').textContent   = num;
  document.getElementById('brebAmountDisplay').textContent   = formatCOP(price);
  // Reset to QR tab
  switchNequiTab('qr', document.querySelector('.nequi-tab'));
  openModal('nequiModal');
}

function switchNequiTab(tab, btn) {
  document.querySelectorAll('.nequi-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nequi-tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tab-' + tab)?.classList.add('active');
}

// =====================================================
//  MIEMBROS
// =====================================================
async function addMember() {
  if (!isAdmin()) { requireAdmin(() => {}); return; }
  const name      = document.getElementById('mName').value.trim();
  const id        = document.getElementById('mId').value.trim();
  const phone     = document.getElementById('mPhone').value.trim();
  const email     = document.getElementById('mEmail').value.trim();
  const plan      = document.getElementById('mPlan').value;
  const startDate = document.getElementById('mStartDate').value;
  const method    = document.getElementById('mPayMethod').value;
  const status    = document.getElementById('mPayStatus').value;
  const notes     = document.getElementById('mNotes').value.trim();

  if (!name || !id || !plan || !startDate) {
    showToast('⚠ Completa los campos obligatorios', 'error');
    return;
  }
  // Cédula is the real PK — no duplicates allowed
  const existing = state.members.find(m => m.cedula === id);
  if (existing) {
    showToast(`⚠ Ya existe un miembro registrado con la cédula ${id} (${existing.name})`, 'error');
    return;
  }

  const p = PLANS[plan];
  const expiryDate   = p.type === 'time'   ? addMonths(startDate, p.months) : null;
  const classesLeft  = p.type === 'clases' ? p.classes : null;
  const member = { id: uid(), name, cedula: id, phone, email, plan, startDate, expiryDate, classesLeft, notes, createdAt: today(), lastCheckin: null, disabled: false, photo: pendingNewMemberPhoto || null, stats: {}, statsHistory: [] };
  pendingNewMemberPhoto = null; // reset for next use
  const prevEl = document.getElementById('newMemberPhotoPreview');
  if (prevEl) prevEl.innerHTML = '<span style="font-size:2rem;opacity:.3">📷</span>';
  // Si el pago es pendiente y el plan es de clases, no otorgar clases todavía
  if (status === 'pendiente' && p.type === 'clases') {
    member.classesLeft = 0;
  }

  state.members.push(member);
  await persistMember(member);

  // Siempre crear el registro de pago con el estado seleccionado
  const payment = {
    id: uid(), memberId: member.id, memberName: member.name, plan,
    amount: PLANS[plan].price, payDate: startDate, expiryDate: expiryDate || startDate, method, status,
  };
  state.payments.push(payment);
  await persistPayment(payment);

  closeModal('addMemberModal');
  clearAddForm();
  showToast('✓ ' + name + ' registrado' + (status === 'pendiente' ? ' — pago pendiente en Admin' : ''));
  showSection('members');
}

function clearAddForm() {
  ['mName','mId','mPhone','mEmail','mNotes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('mStartDate').value = today();
}

function filterMembers() { renderMembers(); }

function renderMembers() {
  const search  = document.getElementById('searchMembers')?.value.toLowerCase() || '';
  const plan    = document.getElementById('filterPlan')?.value || '';
  const status  = document.getElementById('filterStatus')?.value || '';

  let list = state.members.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search) || m.cedula.includes(search);
    const matchPlan   = !plan   || m.plan === plan;
    const overdue     = isOverdue(m.expiryDate);
    const matchStatus = !status || (status === 'activo' ? !overdue : overdue);
    return matchSearch && matchPlan && matchStatus;
  });

  const grid = document.getElementById('membersGrid');
  if (!list.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:3rem">No se encontraron miembros</div>'; return; }

  grid.innerHTML = list.map(m => {
    const plan    = PLANS[m.plan];
    const overdue = plan?.type === 'clases'
      ? (m.classesLeft ?? 0) <= 0
      : isOverdue(m.expiryDate);
    const badge = m.disabled
      ? '<span class="member-badge disabled-badge-pill">INACTIVO</span>'
      : overdue
        ? '<span class="member-badge vencido">VENCIDO</span>'
        : '<span class="member-badge activo">ACTIVO</span>';
    let daysStr;
    if (plan?.type === 'clases') {
      const cl = m.classesLeft ?? 0;
      daysStr = cl <= 0 ? '⚠ Sin clases' : cl <= 2 ? `⚠ ${cl} clase${cl!==1?'s':''} restante${cl!==1?'s':''}` : `${cl} clases restantes`;
    } else {
      const days = daysUntil(m.expiryDate);
      daysStr = overdue ? `Venció hace ${Math.abs(days)}d` : days <= 7 ? `⚠ Vence en ${days}d` : `Vence: ${formatDate(m.expiryDate)}`;
    }
    // daysLeft is scoped outside template for class
    const daysLeft = (plan?.type !== 'clases' && m.expiryDate) ? daysUntil(m.expiryDate) : null;
    const expiryClass = overdue ? 'text-danger' : (daysLeft !== null && daysLeft <= 7) ? 'text-warning' : '';
    const disabled = m.disabled === true;
    return `
      <div class="member-card ${overdue ? 'overdue' : ''} ${disabled ? 'member-disabled' : ''}" onclick="openMemberDetail('${m.id}')">
        <div class="member-card-header">
          <div class="member-avatar" style="${m.photo ? `background-image:url('${m.photo}');background-size:cover;background-position:center;font-size:0` : ''}">${m.photo ? '' : initials(m.name)}</div>
          <div class="member-info">
            <div class="member-name">${m.name} ${disabled ? '<span class="disabled-badge">INACTIVO</span>' : ''}</div>
            <div class="member-id">${m.cedula}</div>
          </div>
          ${badge}
        </div>
        <div class="member-card-body">
          <span class="member-plan-chip">${PLANS[m.plan]?.name || m.plan}</span>
          <span class="member-expiry ${expiryClass}">${daysStr}</span>
        </div>
        ${m.phone ? `<div class="member-phone">📞 ${m.phone}</div>` : ''}
      </div>`;
  }).join('');
}

function openMemberDetail(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  state.currentMemberId = memberId;

  document.getElementById('detailName').textContent = m.name.toUpperCase();

  const payments    = state.payments.filter(p => p.memberId === memberId);
  const overdue     = isOverdue(m.expiryDate);
  const lastCheckins = state.checkins
    .filter(c => c.memberId === memberId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 3);

  // Teléfono → link WhatsApp
  const waNumber = m.phone ? m.phone.replace(/\D/g, '') : '';
  const waLink   = waNumber
    ? `<a class="wa-link" href="https://wa.me/57${waNumber}" target="_blank" rel="noopener">
         📱 ${m.phone} <span class="wa-badge">WhatsApp</span>
       </a>`
    : '—';

  // Mensaje predefinido según estado
  const planName  = PLANS[m.plan]?.name || m.plan;
  const daysLeft  = m.expiryDate ? daysUntil(m.expiryDate) : null;
  let waMsgRaw = '';
  if (overdue) {
    waMsgRaw = `Hola ${m.name.split(' ')[0]}! Te escribimos de Fortaleza Fitness. Tu membresía (${planName}) está vencida. ¿Cuándo podemos renovarla? 💪`;
  } else if (daysLeft !== null && daysLeft <= 7) {
    waMsgRaw = `Hola ${m.name.split(' ')[0]}! Te escribimos de Fortaleza Fitness. Tu membresía (${planName}) vence en ${daysLeft} día${daysLeft!==1?'s':''}. ¡Renuévala a tiempo! 💪`;
  } else if (m.classesLeft !== null && (m.classesLeft ?? 0) <= 2) {
    waMsgRaw = `Hola ${m.name.split(' ')[0]}! Te escribimos de Fortaleza Fitness. Te quedan ${m.classesLeft ?? 0} clase${(m.classesLeft??0)!==1?'s':''} en tu paquete (${planName}). ¡Recarga antes de quedarte sin! 💪`;
  }
  const waQuickLink = waNumber && waMsgRaw
    ? `<a class="wa-reminder-link" href="https://wa.me/57${waNumber}?text=${encodeURIComponent(waMsgRaw)}" target="_blank" rel="noopener">
         💬 Enviar recordatorio
       </a>`
    : '';

  const admin = isAdmin();

  document.getElementById('memberDetailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Cédula / ID</label><div class="value mono">${m.cedula}</div></div>
      <div class="detail-item"><label>Estado</label><div class="value"><span class="member-badge ${overdue ? 'vencido' : 'activo'}">${overdue ? 'VENCIDO' : 'ACTIVO'}</span></div></div>
      <div class="detail-item">
        <label>Teléfono</label>
        <div class="value wa-cell">${waLink}${waQuickLink}</div>
      </div>
      <div class="detail-item"><label>Email</label><div class="value">${m.email || '—'}</div></div>
      <div class="detail-item"><label>Plan Actual</label><div class="value">${PLANS[m.plan]?.name || m.plan}${PLANS[m.plan]?.type === 'clases' ? ` <span class="classes-chip">${m.classesLeft ?? 0} clases</span>` : ''}</div></div>
      <div class="detail-item"><label>Inicio</label><div class="value">${formatDate(m.startDate)}</div></div>
      <div class="detail-item"><label>Vencimiento</label><div class="value ${overdue ? 'text-danger' : ''}">${formatDate(m.expiryDate)}</div></div>
      <div class="detail-item"><label>Miembro desde</label><div class="value">${formatDate(m.createdAt)}</div></div>
      ${m.notes ? `<div class="detail-item full-col"><label>Notas</label><div class="value">${m.notes}</div></div>` : ''}
    </div>
    ${admin ? `
    <div class="admin-detail-block">
      <div class="admin-detail-label">⬟ HISTORIAL DE PAGOS</div>
      ${payments.length === 0 ? '<div class="empty-state">Sin pagos registrados</div>' :
        payments.slice(-5).reverse().map(p => `
          <div class="checkin-item">
            <div class="checkin-avatar" style="font-size:.65rem;width:32px;height:32px">${PLANS[p.plan]?.name?.slice(0,3) || 'PAG'}</div>
            <div class="checkin-info">
              <div class="checkin-name">${PLANS[p.plan]?.name || p.plan} — ${formatCOP(p.amount)}</div>
              <div class="checkin-meta">${p.method} · ${formatDate(p.payDate)}</div>
            </div>
            <div class="checkin-time" style="color:var(--success)">${p.status}</div>
          </div>`).join('')}
    </div>` : ''}
    <div style="margin-top:1.5rem">
      <div class="admin-detail-label">ÚLTIMOS CHECK-INS</div>
      ${lastCheckins.length === 0 ? '<div class="empty-state">Sin check-ins</div>' :
        lastCheckins.map(c => `
          <div class="checkin-item">
            <div class="checkin-avatar">${initials(c.memberName)}</div>
            <div class="checkin-info">
              <div class="checkin-name">${c.memberName}</div>
              <div class="checkin-meta">${c.timestamp.slice(0, 10)} a las ${c.timestamp.slice(11, 16)}</div>
            </div>
            ${c.overdue ? '<span style="color:var(--danger);font-size:.7rem">⚠ vencido</span>' : ''}
          </div>`).join('')}
    </div>`;
  // Footer extra buttons
  const footerExtra = document.getElementById('memberDetailFooterExtra');
  if (footerExtra) {
    const mid = m.id;
    footerExtra.innerHTML =
      '<button class="btn-stats-open" onclick="openStatsModal(\'' + mid + '\')">📊 Stats / RM</button>' +
      (window.matchMedia('(max-width:768px)').matches
        ? '<button class="btn-photo" onclick="openPhotoCapture(\'' + mid + '\')">📷 Foto</button>'
        : '');
  }
  // Update disable button label dynamically
  const disableBtn = document.querySelector('.btn-disable');
  if (disableBtn) {
    disableBtn.textContent = m.disabled ? '✓ Reactivar' : '⊘ Deshabilitar';
    disableBtn.style.background = m.disabled ? 'rgba(60,255,138,.1)' : '';
    disableBtn.style.borderColor = m.disabled ? 'rgba(60,255,138,.3)' : '';
    disableBtn.style.color = m.disabled ? 'var(--success)' : '';
  }
  // Mostrar/ocultar botones admin según sesión activa
  const adminBtns = document.getElementById('adminOnlyBtns');
  if (adminBtns) adminBtns.style.display = isAdmin() ? 'flex' : 'none';
  openModal('memberDetailModal');
}

async function deleteMemberConfirm() {
  if (!isAdmin()) { requireAdmin(() => deleteMemberConfirm()); return; }
  const id = state.currentMemberId;
  if (!id) return;
  const m = state.members.find(x => x.id === id);
  if (!confirm(`¿Eliminar PERMANENTEMENTE a ${m?.name}? Esta acción no se puede deshacer.`)) return;

  state.members  = state.members.filter(x => x.id !== id);
  state.payments = state.payments.filter(x => x.memberId !== id);
  state.checkins = state.checkins.filter(x => x.memberId !== id);

  await deleteMemberFromDB(id);
  closeModal('memberDetailModal');
  showToast('Miembro eliminado permanentemente', 'error');
  renderMembers();
  renderDashboard();
}

async function toggleMemberDisabled() {
  if (!isAdmin()) { requireAdmin(() => toggleMemberDisabled()); return; }
  const id = state.currentMemberId;
  if (!id) return;
  const m = state.members.find(x => x.id === id);
  if (!m) return;
  m.disabled = !m.disabled;
  await persistMember(m);
  closeModal('memberDetailModal');
  showToast(m.disabled ? `${m.name} deshabilitado` : `${m.name} reactivado`);
  renderMembers();
  renderDashboard();
}

function openRenewModal() {
  requireAdmin(() => openModal('renewModal'));
}

async function renewPlan() {
  const id     = state.currentMemberId;
  const plan   = document.getElementById('renewPlan').value;
  const method = document.getElementById('renewMethod').value;
  if (!id || !plan) return;

  const m         = state.members.find(x => x.id === id);
  const rp        = PLANS[plan];
  const startDate = today();
  const expiryDate   = rp.type === 'time'   ? addMonths(startDate, rp.months) : null;
  const classesLeft  = rp.type === 'clases' ? (m.plan === plan && m.classesLeft ? m.classesLeft + rp.classes : rp.classes) : null;

  m.plan        = plan;
  m.startDate   = startDate;
  m.expiryDate  = expiryDate;
  m.classesLeft = classesLeft;
  await persistMember(m);

  const payment = {
    id: uid(), memberId: m.id, memberName: m.name, plan,
    amount: rp.price, payDate: startDate, expiryDate: expiryDate || startDate, method, status: 'pagado',
  };
  state.payments.push(payment);
  await persistPayment(payment);

  closeModal('renewModal');
  closeModal('memberDetailModal');
  showToast(`✓ Plan renovado: ${PLANS[plan].name} para ${m.name}`);
  renderDashboard();
  renderMembers();
}

// =====================================================
//  PAGOS
// =====================================================
function renderPayments() {
  const tbody  = document.getElementById('paymentsBody');
  const cards  = document.getElementById('paymentsCards');
  const sorted = [...state.payments].sort((a, b) => b.payDate.localeCompare(a.payDate));
  const METHOD_LABELS = { efectivo:'Efectivo', nequi:'Nequi/Bre-B', transferencia:'Transferencia', tarjeta:'Tarjeta' };

  if (!sorted.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">Sin pagos registrados</td></tr>';
    if (cards) cards.innerHTML = '<div class="empty-state">Sin pagos registrados</div>';
    return;
  }

  // Desktop table rows
  if (tbody) {
    tbody.innerHTML = sorted.map(p => `
      <tr>
        <td>${p.memberName}</td>
        <td><span class="member-plan-chip">${PLANS[p.plan]?.name || p.plan}</span></td>
        <td style="font-family:monospace;color:var(--accent)">${formatCOP(p.amount)}</td>
        <td>${formatDate(p.payDate)}</td>
        <td>${formatDate(p.expiryDate)}</td>
        <td>${METHOD_LABELS[p.method] || p.method}</td>
        <td><span class="member-badge ${p.status === 'pagado' ? 'activo' : 'vencido'}">${p.status.toUpperCase()}</span></td>
      </tr>`).join('');
  }

  // Mobile cards
  if (cards) {
    cards.innerHTML = sorted.map(p => `
      <div class="payment-card">
        <div class="payment-card-header">
          <span class="payment-card-name">${p.memberName}</span>
          <span class="member-badge ${p.status === 'pagado' ? 'activo' : 'vencido'}">${p.status.toUpperCase()}</span>
        </div>
        <div class="payment-card-row">
          <span class="member-plan-chip">${PLANS[p.plan]?.name || p.plan}</span>
          <span class="payment-card-amount">${formatCOP(p.amount)}</span>
        </div>
        <div class="payment-card-meta">
          <span>📅 ${formatDate(p.payDate)}</span>
          <span>💳 ${METHOD_LABELS[p.method] || p.method}</span>
        </div>
      </div>`).join('');
  }
}

// =====================================================
//  CHECK-IN
// =====================================================
let checkinSuggestionIndex = -1;

function searchCheckin() {
  const q   = document.getElementById('checkinSearch').value.trim().toLowerCase();
  const box = document.getElementById('checkinSuggestions');

  if (!q) { box.innerHTML = ''; return; }

  const matches = state.members.filter(m =>
    m.name.toLowerCase().includes(q) || m.cedula.includes(q)
  ).slice(0, 6);

  if (!matches.length) { box.innerHTML = '<div class="suggestion-empty">Sin resultados</div>'; return; }

  box.innerHTML = matches.map(m => {
    const overdue = isOverdue(m.expiryDate);
    return `
      <div class="suggestion-item ${overdue ? 'overdue' : ''}" onclick="registerCheckin('${m.id}')">
        <div class="suggestion-avatar">${initials(m.name)}</div>
        <div class="suggestion-info">
          <div class="suggestion-name">${m.name}</div>
          <div class="suggestion-meta">${m.cedula} · ${PLANS[m.plan]?.name || m.plan}</div>
        </div>
        ${overdue ? '<span style="color:var(--danger);font-size:.7rem">⚠ vencido</span>' : '<span style="color:var(--success);font-size:.7rem">✓</span>'}
      </div>`;
  }).join('');
}

function manualCheckin() {
  const q = document.getElementById('checkinSearch').value.trim().toLowerCase();
  if (!q) return;
  const m = state.members.find(x => x.name.toLowerCase() === q || x.cedula === q);
  if (m) registerCheckin(m.id);
  else showToast('Miembro no encontrado', 'error');
}


// =====================================================
//  HORARIOS DEL GIMNASIO
//  L-V AM:  5-6, 6-7, 7-8, 8-9, 9-11
//  L-V PM:  17-18, 18-19, 19-20, 20-21
//  Sábado AM: 6-7, 7-8, 8-9
// =====================================================
const GYM_SCHEDULE = {
  // día 1=Lunes…5=Viernes, 6=Sábado
  weekday: [  // L-V
    { start: 5,  end: 6  },
    { start: 6,  end: 7  },
    { start: 7,  end: 8  },
    { start: 8,  end: 9  },
    { start: 9,  end: 11 },
    { start: 17, end: 18 },
    { start: 18, end: 19 },
    { start: 19, end: 20 },
    { start: 20, end: 21 },
  ],
  saturday: [ // Sábado
    { start: 6,  end: 7  },
    { start: 7,  end: 8  },
    { start: 8,  end: 9  },
  ],
};

// Devuelve el slot activo o null si está fuera de horario
// slot: "5:00-6:00", "17:00-18:00", etc.
function getCurrentSlot(dateObj) {
  const d   = dateObj || new Date();
  const dow = d.getDay(); // 0=Dom,1=Lun…6=Sab
  const h   = d.getHours() + d.getMinutes() / 60;

  let slots = null;
  if (dow >= 1 && dow <= 5) slots = GYM_SCHEDULE.weekday;
  if (dow === 6)             slots = GYM_SCHEDULE.saturday;
  if (!slots) return null; // domingo

  for (const s of slots) {
    if (h >= s.start && h < s.end) {
      return `${s.start}:00-${s.end}:00`;
    }
  }
  return null;
}

// Para una timestamp guardada, devuelve en qué slot estaba
function getSlotForTime(tsStr) {
  if (!tsStr) return null;
  // tsStr es "YYYY-MM-DDTHH:MM:SS" en hora local
  const d = new Date(tsStr);
  return getCurrentSlot(d);
}

// Devuelve el próximo slot que va a abrir
function getNextSlotTime(dateObj) {
  const d   = dateObj || new Date();
  const dow = d.getDay();
  const h   = d.getHours() + d.getMinutes() / 60;

  let slots = null;
  if (dow >= 1 && dow <= 5) slots = GYM_SCHEDULE.weekday;
  if (dow === 6)             slots = GYM_SCHEDULE.saturday;
  if (!slots) return 'el próximo lunes a las 5:00 AM';

  // Buscar primer slot futuro hoy
  for (const s of slots) {
    if (s.start > h) {
      const label = s.start >= 12
        ? `${s.start > 12 ? s.start - 12 : s.start}:00 PM`
        : `${s.start}:00 AM`;
      return label;
    }
  }

  // No hay más slots hoy
  if (dow === 5) return 'el sábado a las 6:00 AM';
  if (dow === 6) return 'el lunes a las 5:00 AM';
  return 'mañana a las 5:00 AM';
}

// Estado actual del gimnasio respecto a horarios
function getCheckinScheduleStatus() {
  const now  = new Date();
  const slot = getCurrentSlot(now);
  if (slot) {
    return { allowed: true, slot, msg: '', nextSlotTime: getNextSlotTime(now) };
  }
  const next = getNextSlotTime(now);
  return { allowed: false, slot: null, msg: `El próximo horario disponible es ${next}`, nextSlotTime: next };
}

async function registerCheckin(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;

  document.getElementById('checkinSearch').value = '';
  document.getElementById('checkinSuggestions').innerHTML = '';

  // ── Validación: miembro deshabilitado ───────────────────
  if (m.disabled) {
    showToast(`⛔ ${m.name} está INACTIVO. Contacta al administrador.`, 'error');
    return;
  }

  // ── Validación horario y bloque por clase ───────────────
  const scheduleCheck = getCheckinScheduleStatus();
  if (!scheduleCheck.allowed) {
    showToast(`⏰ Fuera de horario. ${scheduleCheck.msg}`, 'error');
    return;
  }

  // Bloquear si ya hizo check-in en este mismo slot horario
  if (m.lastCheckin) {
    const lastSlot = getSlotForTime(m.lastCheckin);
    const nowSlot  = scheduleCheck.slot;
    if (lastSlot && nowSlot && lastSlot === nowSlot) {
      const nextSlotStart = scheduleCheck.nextSlotTime;
      showToast(`⏱ ${m.name} ya ingresó en este horario (${nowSlot}). Próximo check-in: ${nextSlotStart}`, 'error');
      return;
    }
  }

  // ── Validación plan ─────────────────────────────────────
  const plan = PLANS[m.plan];
  let overdue = false;

  if (plan?.type === 'time') {
    overdue = isOverdue(m.expiryDate);
    if (overdue) {
      showToast(`⚠ ${m.name} — membresía VENCIDA. Debe renovar.`, 'error');
      return;
    }
  } else if (plan?.type === 'clases') {
    if (!m.classesLeft || m.classesLeft <= 0) {
      showToast(`⚠ ${m.name} — no tiene clases disponibles. Debe recargar.`, 'error');
      return;
    }
    // Descontar 1 clase
    m.classesLeft -= 1;
  }

  const ts      = localISOString();
  const checkin = { id: uid(), memberId: m.id, memberName: m.name, plan: m.plan, timestamp: ts, overdue };

  state.checkins.push(checkin);
  m.lastCheckin = ts;

  await persistCheckin(checkin);
  await persistMember(m);

  if (plan?.type === 'clases') {
    showToast(`✓ ${m.name} — clase registrada. Quedan ${m.classesLeft} clase${m.classesLeft !== 1 ? 's' : ''}`);
  } else {
    showToast(`✓ ${m.name} registrado — ${plan?.name}`);
  }

  renderTodayCheckins();
  renderDashboard();
  renderMembers();
}

function renderGymHoursBanner() {
  const el = document.getElementById('gymHoursBanner');
  if (!el) return;
  const status = getCheckinScheduleStatus();
  if (status.allowed) {
    el.innerHTML = `<span class="hours-open">✓ Abierto · Clase ${status.slot}</span>`;
    el.className = 'gym-hours-banner hours-banner-open';
  } else {
    el.innerHTML = `<span>⏰ Fuera de horario · ${status.msg}</span>`;
    el.className = 'gym-hours-banner hours-banner-closed';
  }
}

function renderTodayCheckins() {
  const todayStr = today();
  const list = state.checkins
    .filter(c => c.timestamp.startsWith(todayStr))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  document.getElementById('todayCount').textContent = `${list.length} registros`;
  const el = document.getElementById('todayCheckins');

  if (!list.length) { el.innerHTML = '<div class="empty-state">Sin check-ins hoy</div>'; return; }

  el.innerHTML = list.map(c => `
    <div class="checkin-item">
      <div class="checkin-avatar" style="${c.overdue ? 'background:rgba(255,59,92,.1);border-color:rgba(255,59,92,.3);color:var(--danger)' : ''}">${initials(c.memberName)}</div>
      <div class="checkin-info">
        <div class="checkin-name">${c.memberName}</div>
        <div class="checkin-meta"><span class="member-plan-chip" style="font-size:.65rem;padding:2px 6px">${c.plan}</span>${c.overdue ? ' <span style="color:var(--danger)">⚠ Vencido</span>' : ''}</div>
      </div>
      <div class="checkin-time">${c.timestamp.slice(11, 16)}</div>
    </div>`).join('');
}

// =====================================================
//  DASHBOARD
// =====================================================
function renderDashboard() {
  const active  = state.members.filter(m => {
    const p = PLANS[m.plan];
    if (p?.type === 'clases') return (m.classesLeft ?? 0) > 0;
    return !isOverdue(m.expiryDate);
  }).length;
  const overdue = state.members.filter(m => {
    const p = PLANS[m.plan];
    if (p?.type === 'clases') return (m.classesLeft ?? 0) <= 0;
    return isOverdue(m.expiryDate);
  }).length;
  const todayStr = today();
  const checkins = state.checkins.filter(c => c.timestamp.startsWith(todayStr)).length;

  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const revenue = state.payments
    .filter(p => p.payDate.startsWith(thisMonth) && p.status === 'pagado')
    .reduce((s, p) => s + p.amount, 0);

  document.getElementById('stat-active').textContent   = active;
  document.getElementById('stat-checkins').textContent = checkins;

  // Elementos solo visibles para admin — toggle explícito
  const admin = isAdmin();
  document.getElementById('stat-overdue').textContent  = overdue;
  document.getElementById('stat-revenue').textContent  = formatCOP(revenue);
  ['card-revenue', 'card-overdue', 'card-expiring'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = admin ? 'block' : 'none';
  });

  // Solo check-ins de HOY
  const todayCIs = state.checkins
    .filter(c => c.timestamp.startsWith(todayStr))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);
  const dCI = document.getElementById('dashboardCheckins');
  dCI.innerHTML = todayCIs.length === 0
    ? '<div class="empty-state">Sin check-ins hoy</div>'
    : todayCIs.map(c => `
      <div class="checkin-item">
        <div class="checkin-avatar">${initials(c.memberName)}</div>
        <div class="checkin-info">
          <div class="checkin-name">${c.memberName}</div>
          <div class="checkin-meta"><span class="member-plan-chip" style="font-size:.65rem;padding:2px 6px">${PLANS[c.plan]?.name || c.plan}</span></div>
        </div>
        <div class="checkin-time">${c.timestamp.slice(11, 16)}</div>
      </div>`).join('');

  // Expiring soon
  const expiring = state.members
    .filter(m => { const d = daysUntil(m.expiryDate); return d >= 0 && d <= 7; })
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const dExp = document.getElementById('dashboardExpiring');
  dExp.innerHTML = expiring.length === 0
    ? '<div class="empty-state">Sin vencimientos próximos</div>'
    : expiring.map(m => `
      <div class="checkin-item">
        <div class="checkin-avatar">${initials(m.name)}</div>
        <div class="checkin-info">
          <div class="checkin-name">${m.name}</div>
          <div class="checkin-meta"><span class="member-plan-chip" style="font-size:.65rem;padding:2px 6px">${m.plan}</span></div>
        </div>
        <div class="checkin-time" style="color:var(--warning)">${daysUntil(m.expiryDate)}d</div>
      </div>`).join('');
}

// =====================================================
//  DATOS DEMO
// =====================================================
async function seedDemo() {
  if (state.members.length > 0) return;

  const demos = [
    { name:'Carlos Rodríguez', cedula:'1020405678', phone:'301 234 5678', email:'carlos@email.com', plan:'mesIlimitado', daysAgo:10 },
    { name:'Laura Gómez',      cedula:'1032456789', phone:'312 345 6789', email:'laura@email.com',  plan:'paquete12',   classes:8 },
    { name:'Andrés Martínez',  cedula:'79456321',   phone:'320 456 7890', email:'andres@email.com', plan:'mesIlimitado', daysAgo:5 },
    { name:'Valentina Torres', cedula:'1015678901', phone:'315 567 8901', email:'vale@email.com',   plan:'paquete15',   classes:2, notes:'Lesión rodilla' },
    { name:'Sebastián López',  cedula:'1000123456', phone:'300 678 9012', email:'seba@email.com',   plan:'clase',       classes:0 },
    { name:'Diana Herrera',    cedula:'1098765432', phone:'315 432 1098', email:'diana@email.com',  plan:'seven',       daysAgo:3,  notes:'Atleta alto rendimiento' },
  ];

  for (const dm of demos) {
    const d = new Date(); d.setDate(d.getDate() - (dm.daysAgo || 0));
    const startDate   = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
    const plan        = PLANS[dm.plan];
    const expiryDate  = plan.type === 'time'   ? addMonths(startDate, plan.months) : null;
    const classesLeft = plan.type === 'clases' ? (dm.classes ?? plan.classes) : null;
    const m = { id:uid(), name:dm.name, cedula:dm.cedula, phone:dm.phone, email:dm.email, plan:dm.plan, startDate, expiryDate, classesLeft, notes:dm.notes||'', createdAt:startDate, lastCheckin:null, disabled:false, photo:null, stats:{}, statsHistory:[] };
    state.members.push(m);
    state.payments.push({ id:uid(), memberId:m.id, memberName:m.name, plan:dm.plan, amount:plan.price, payDate:startDate, expiryDate: expiryDate || startDate, method:'efectivo', status:'pagado' });
  }

  // 3 check-ins hoy
  state.members.slice(0, 3).forEach((m, i) => {
    const t = new Date(); t.setHours(6 + i * 2, 30, 0, 0);
    const pad = v => String(v).padStart(2,'0');
    const ts = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
    state.checkins.push({ id:uid(), memberId:m.id, memberName:m.name, plan:m.plan, timestamp:ts, overdue:false });
  });

  saveLocal();
}

// =====================================================
//  MÓDULO ADMIN
// =====================================================

function openAdminSection() {
  requireAdmin(() => {
    showSection('admin');
    // renderAdminSection is also called inside showSection, but call again to be safe
  });
}

function renderAdminSection() {
  // Populate member select (todos los miembros activos)
  const sel = document.getElementById('adminMember');
  if (sel) {
    sel.innerHTML = '<option value="">Seleccionar miembro...</option>' +
      state.members
        .filter(m => !m.disabled)
        .map(m => `<option value="${m.id}">${m.name} — ${m.cedula}</option>`)
        .join('');
  }

  // ── Pagos pendientes: status === 'pendiente' ─────────────
  const pending = state.payments.filter(p => p.status === 'pendiente');
  const el = document.getElementById('pendingPaymentsList');
  const countEl = document.getElementById('pendingCount');
  if (countEl) countEl.textContent = pending.length;

  if (!el) return;

  if (pending.length === 0) {
    el.innerHTML = '<div class="empty-state">✓ No hay pagos pendientes</div>';
    return;
  }

  el.innerHTML = pending.map(p => {
    const member = state.members.find(m => m.id === p.memberId);
    const planObj = PLANS[p.plan];
    const methodLabel = { efectivo:'Efectivo', nequi:'Nequi/Bre-B', transferencia:'Transferencia', tarjeta:'Tarjeta' };
    return `
      <div class="pending-payment-row">
        <div class="pending-avatar">${initials(p.memberName)}</div>
        <div class="pending-info">
          <div class="pending-name">${p.memberName}</div>
          <div class="pending-meta">
            ${planObj?.name || p.plan} · ${formatCOP(p.amount)} · ${methodLabel[p.method] || p.method} · ${formatDate(p.payDate)}
          </div>
          ${member?.cedula ? `<div class="pending-cedula">CC ${member.cedula}</div>` : ''}
        </div>
        <div class="pending-actions">
          <button class="btn-confirm-pay" onclick="confirmPendingPayment('${p.id}')">✓ Confirmar</button>
          <button class="btn-reject-pay" onclick="rejectPendingPayment('${p.id}')">✕ Rechazar</button>
        </div>
      </div>`;
  }).join('');
}

async function confirmPendingPayment(paymentId) {
  const payment = state.payments.find(p => p.id === paymentId);
  if (!payment) return;

  // Marcar pago como pagado
  payment.status = 'pagado';

  // Activar plan del miembro
  const member = state.members.find(m => m.id === payment.memberId);
  if (member) {
    const plan = PLANS[payment.plan];
    member.plan = payment.plan;
    if (plan?.type === 'time') {
      // Para planes de tiempo: extender desde hoy (o desde vencimiento actual si aún está activo)
      const base = member.expiryDate && !isOverdue(member.expiryDate) ? member.expiryDate : today();
      member.expiryDate  = addMonths(base, plan.months);
    } else if (plan?.type === 'clases') {
      // Para planes de clases: sumar las clases del plan
      member.classesLeft = (member.classesLeft || 0) + plan.classes;
    }
    member.disabled = false; // reactivar si estaba deshabilitado
    await persistMember(member);
  }

  await persistPayment(payment);
  showToast('✓ Pago de ' + payment.memberName + ' confirmado — plan activado');
  renderAdminSection();
  renderDashboard();
  renderMembers();
}

async function rejectPendingPayment(paymentId) {
  if (!confirm('¿Eliminar este pago pendiente?')) return;
  state.payments = state.payments.filter(p => p.id !== paymentId);
  if (useSupabase) {
    await db.from('payments').delete().eq('id', paymentId);
  }
  saveLocal();
  showToast('Pago pendiente eliminado', 'error');
  renderAdminSection();
}

function adminMemberSelected() {
  // Auto-fill plan if member has a current plan
  const memberId = document.getElementById('adminMember').value;
  if (!memberId) return;
  const m = state.members.find(x => x.id === memberId);
  if (m?.plan) document.getElementById('adminPlan').value = m.plan;
  adminPlanSelected();
}

function adminPlanSelected() {
  const planKey = document.getElementById('adminPlan').value;
  const plan = PLANS[planKey];
  if (plan) document.getElementById('adminAmount').value = plan.price;
}

async function adminRegisterPayment() {
  const memberId = document.getElementById('adminMember').value;
  const planKey  = document.getElementById('adminPlan').value;
  const method   = document.getElementById('adminMethod').value;
  const amount   = Number(document.getElementById('adminAmount').value);

  if (!memberId || !planKey || !amount) {
    showToast('Completa todos los campos', 'error');
    return;
  }

  const member = state.members.find(m => m.id === memberId);
  const plan   = PLANS[planKey];
  if (!member || !plan) return;

  const startDate  = today();
  const expiryDate = plan.type === 'time' ? addMonths(startDate, plan.months) : null;

  // Update member
  member.plan = planKey;
  if (plan.type === 'time') {
    member.expiryDate  = expiryDate;
  } else if (plan.type === 'clases') {
    member.classesLeft = (member.classesLeft || 0) + plan.classes;
    member.expiryDate  = null;
  }
  await persistMember(member);

  const payment = {
    id: uid(), memberId: member.id, memberName: member.name, plan: planKey,
    amount, payDate: startDate, expiryDate: expiryDate || startDate, method, status: 'pagado',
  };
  state.payments.push(payment);
  await persistPayment(payment);

  showToast(`✓ Pago registrado: ${member.name} — ${plan.name}`);
  document.getElementById('adminMember').value  = '';
  document.getElementById('adminAmount').value  = '';
  renderAdminSection();
  renderDashboard();
  renderMembers();
}

// =====================================================
//  FOTO DE PERFIL (móvil)
// =====================================================

// Stores photo data URL for new member form (before save)
let pendingNewMemberPhoto = null;

function captureNewMemberPhoto() {
  const input = document.getElementById('photoInput');
  input.setAttribute('data-mode', 'new');
  input.click();
}

function openPhotoCapture(memberId) {
  const input = document.getElementById('photoInput');
  input.setAttribute('data-mode', 'existing');
  input.setAttribute('data-member', memberId);
  input.click();
}

document.addEventListener('DOMContentLoaded', () => {
  const photoInput = document.getElementById('photoInput');
  if (!photoInput) return;

  photoInput.addEventListener('change', async function() {
    const file = this.files[0];
    if (!file) return;
    const mode = this.getAttribute('data-mode');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      if (mode === 'new') {
        pendingNewMemberPhoto = dataUrl;
        const prev = document.getElementById('newMemberPhotoPreview');
        if (prev) prev.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />';
        showToast('✓ Foto lista para guardar');
      } else {
        const memberId = this.getAttribute('data-member');
        const m = state.members.find(x => x.id === memberId);
        if (!m) return;
        m.photo = dataUrl;
        await persistMember(m);
        showToast('✓ Foto actualizada');
        renderMembers();
        if (state.currentMemberId === memberId) openMemberDetail(memberId);
      }
    };
    reader.readAsDataURL(file);
    this.value = '';
  });
});

// =====================================================
//  ESTADÍSTICAS / RMs  
// =====================================================

const STAT_FIELDS = [
  { key: 'backSquat',    label: 'Back Squat',     unit: 'kg', icon: '🏋️' },
  { key: 'frontSquat',   label: 'Front Squat',    unit: 'kg', icon: '🏋️' },
  { key: 'deadlift',     label: 'Deadlift',        unit: 'kg', icon: '💪' },
  { key: 'clean',        label: 'Clean',           unit: 'kg', icon: '🔱' },
  { key: 'cleanJerk',    label: 'Clean & Jerk',    unit: 'kg', icon: '🔱' },
  { key: 'snatch',       label: 'Snatch',          unit: 'kg', icon: '⚡' },
  { key: 'overheadSq',   label: 'Overhead Squat',  unit: 'kg', icon: '🔺' },
  { key: 'press',        label: 'Strict Press',    unit: 'kg', icon: '💪' },
  { key: 'benchPress',   label: 'Bench Press',     unit: 'kg', icon: '🏋️' },
  { key: 'pullUps',      label: 'Pull-ups máx.',   unit: 'reps', icon: '🤸' },
  { key: 'rowCal500',    label: 'Remo 500m',       unit: 's',  icon: '🚣' },
  { key: 'fran',         label: 'Fran (21-15-9)',  unit: 's',  icon: '🔥' },
  { key: 'weight',       label: 'Peso corporal',   unit: 'kg', icon: '⚖️' },
  { key: 'height',       label: 'Estatura',        unit: 'cm', icon: '📏' },
];

function openStatsModal(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  state.currentMemberId = memberId;

  const stats = m.stats || {};
  const admin = isAdmin();

  document.getElementById('statsModalTitle').textContent = m.name.toUpperCase();
  document.getElementById('statsGrid').innerHTML = STAT_FIELDS.map(f => `
    <div class="stat-field-card">
      <div class="stat-field-icon">${f.icon}</div>
      <div class="stat-field-label">${f.label}</div>
      <div class="stat-field-unit">${f.unit}</div>
      <input
        class="stat-field-input"
        type="number"
        id="stat_${f.key}"
        value="${stats[f.key] ?? ''}"
        placeholder="—"
        step="${f.unit === 'kg' || f.unit === 'cm' ? '0.5' : '1'}"
        ${admin ? '' : ''}
      />
    </div>
  `).join('');

  // Load history
  renderStatsHistory(m);
  openModal('statsModal');
}

function renderStatsHistory(m) {
  const history = (m.statsHistory || []).slice().reverse().slice(0, 5);
  const el = document.getElementById('statsHistory');
  if (!el) return;
  if (!history.length) { el.innerHTML = '<div class="empty-state">Sin historial aún</div>'; return; }
  el.innerHTML = history.map(h => {
    const summary = Object.entries(h.values)
      .filter(([,v]) => v)
      .map(([k,v]) => {
        const f = STAT_FIELDS.find(x => x.key === k);
        return f ? f.label + ': ' + v + f.unit : '';
      }).filter(Boolean).slice(0,3).join(' · ');
    return '<div class="stats-history-row">' +
      '<span class="stats-hist-date">' + h.date + '</span>' +
      '<span class="stats-hist-summary">' + summary + '</span>' +
      '</div>';
  }).join('');
}

async function saveStats() {
  const memberId = state.currentMemberId;
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;

  const newStats = {};
  STAT_FIELDS.forEach(f => {
    const val = document.getElementById('stat_' + f.key)?.value;
    if (val !== '' && val !== undefined) newStats[f.key] = Number(val);
  });

  // Save to history
  if (!m.statsHistory) m.statsHistory = [];
  m.statsHistory.push({ date: today(), values: { ...newStats } });
  // Keep last 20 snapshots
  if (m.statsHistory.length > 20) m.statsHistory = m.statsHistory.slice(-20);

  m.stats = newStats;
  await persistMember(m);

  closeModal('statsModal');
  showToast('✓ Estadísticas guardadas');
}

// =====================================================
//  INIT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  await loadAll();
  await seedDemo();

  document.getElementById('mStartDate').value = today();
  updateClock();
  setInterval(updateClock, 1000);
  updateAdminUI(); // oculta elementos protegidos y renderiza dashboard
});
