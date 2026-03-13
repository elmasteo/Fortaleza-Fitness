// =====================================================
//  FORTALEZA FITNESS — APP.JS
//  Persistencia: Supabase (primario) + localStorage (fallback)
// =====================================================

// ===== PLANES =====
const PLANS = {
  mensual:    { name: 'Mensual',    price: 80000,   months: 1,  label: '$80.000/mes' },
  trimestral: { name: 'Trimestral', price: 216000,  months: 3,  label: '$216.000/3m' },
  semestral:  { name: 'Semestral',  price: 408000,  months: 6,  label: '$408.000/6m' },
  anual:      { name: 'Anual',      price: 720000,  months: 12, label: '$720.000/año' },
};

// ===== ESTADO LOCAL =====
let state = { members: [], payments: [], checkins: [], currentMemberId: null };

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
  return d.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }
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
//  NAVEGACIÓN
// =====================================================
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');
  const titles = { dashboard:'Dashboard', members:'Miembros', payments:'Pagos', checkin:'Check-In', plans:'Planes' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'dashboard') renderDashboard();
  if (name === 'members')   renderMembers();
  if (name === 'payments')  renderPayments();
  if (name === 'checkin')   renderTodayCheckins();
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
  if (state.members.find(m => m.cedula === id)) {
    showToast('⚠ Ya existe un miembro con ese ID', 'error');
    return;
  }

  const expiryDate = addMonths(startDate, PLANS[plan].months);
  const member = { id: uid(), name, cedula: id, phone, email, plan, startDate, expiryDate, notes, createdAt: today(), lastCheckin: null };
  state.members.push(member);
  await persistMember(member);

  if (status === 'pagado') {
    const payment = {
      id: uid(), memberId: member.id, memberName: member.name, plan,
      amount: PLANS[plan].price, payDate: startDate, expiryDate, method, status: 'pagado',
    };
    state.payments.push(payment);
    await persistPayment(payment);
  }

  closeModal('addMemberModal');
  clearAddForm();
  showToast(`✓ ${name} registrado`);
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
    const overdue = isOverdue(m.expiryDate);
    const badge   = overdue
      ? '<span class="member-badge vencido">VENCIDO</span>'
      : `<span class="member-badge activo">ACTIVO</span>`;
    const days    = daysUntil(m.expiryDate);
    const daysStr = overdue ? `Venció hace ${Math.abs(days)}d` : days <= 7 ? `⚠ Vence en ${days}d` : `Vence: ${formatDate(m.expiryDate)}`;
    return `
      <div class="member-card ${overdue ? 'overdue' : ''}" onclick="openMemberDetail('${m.id}')">
        <div class="member-card-header">
          <div class="member-avatar">${initials(m.name)}</div>
          <div class="member-info">
            <div class="member-name">${m.name}</div>
            <div class="member-id">${m.cedula}</div>
          </div>
          ${badge}
        </div>
        <div class="member-card-body">
          <span class="member-plan-chip">${PLANS[m.plan]?.name || m.plan}</span>
          <span class="member-expiry ${overdue ? 'text-danger' : days <= 7 ? 'text-warning' : ''}">${daysStr}</span>
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

  document.getElementById('memberDetailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Cédula / ID</label><div class="value" style="font-family:monospace">${m.cedula}</div></div>
      <div class="detail-item"><label>Estado</label><div class="value"><span class="member-badge ${overdue ? 'vencido' : 'activo'}">${overdue ? 'VENCIDO' : 'ACTIVO'}</span></div></div>
      <div class="detail-item"><label>Teléfono</label><div class="value">${m.phone || '—'}</div></div>
      <div class="detail-item"><label>Email</label><div class="value">${m.email || '—'}</div></div>
      <div class="detail-item"><label>Plan Actual</label><div class="value">${PLANS[m.plan]?.name || m.plan}</div></div>
      <div class="detail-item"><label>Inicio</label><div class="value">${formatDate(m.startDate)}</div></div>
      <div class="detail-item"><label>Vencimiento</label><div class="value ${overdue ? 'text-danger' : ''}">${formatDate(m.expiryDate)}</div></div>
      <div class="detail-item"><label>Miembro desde</label><div class="value">${formatDate(m.createdAt)}</div></div>
      ${m.notes ? `<div class="detail-item" style="grid-column:1/-1"><label>Notas</label><div class="value">${m.notes}</div></div>` : ''}
    </div>
    <div style="margin-top:1.5rem">
      <div style="font-size:.75rem;letter-spacing:2px;color:var(--text-secondary);margin-bottom:.75rem;font-family:monospace">HISTORIAL DE PAGOS</div>
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
    </div>
    <div style="margin-top:1.5rem">
      <div style="font-size:.75rem;letter-spacing:2px;color:var(--text-secondary);margin-bottom:.75rem;font-family:monospace">ÚLTIMOS CHECK-INS</div>
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
  openModal('memberDetailModal');
}

async function deleteMemberConfirm() {
  const id = state.currentMemberId;
  if (!id) return;
  const m = state.members.find(x => x.id === id);
  if (!confirm(`¿Eliminar a ${m?.name}? Esta acción no se puede deshacer.`)) return;

  state.members  = state.members.filter(x => x.id !== id);
  state.payments = state.payments.filter(x => x.memberId !== id);
  state.checkins = state.checkins.filter(x => x.memberId !== id);

  await deleteMemberFromDB(id);
  closeModal('memberDetailModal');
  showToast('Miembro eliminado', 'error');
  renderMembers();
  renderDashboard();
}

function openRenewModal() { openModal('renewModal'); }

async function renewPlan() {
  const id     = state.currentMemberId;
  const plan   = document.getElementById('renewPlan').value;
  const method = document.getElementById('renewMethod').value;
  if (!id || !plan) return;

  const m          = state.members.find(x => x.id === id);
  const startDate  = today();
  const expiryDate = addMonths(startDate, PLANS[plan].months);

  m.plan       = plan;
  m.startDate  = startDate;
  m.expiryDate = expiryDate;
  await persistMember(m);

  const payment = {
    id: uid(), memberId: m.id, memberName: m.name, plan,
    amount: PLANS[plan].price, payDate: startDate, expiryDate, method, status: 'pagado',
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
  const tbody = document.getElementById('paymentsBody');
  const sorted = [...state.payments].sort((a, b) => b.payDate.localeCompare(a.payDate));

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">Sin pagos registrados</td></tr>';
    return;
  }

  const METHOD_LABELS = { efectivo:'Efectivo', nequi:'Nequi/Bre-B', transferencia:'Transferencia', tarjeta:'Tarjeta' };

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

async function registerCheckin(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;

  document.getElementById('checkinSearch').value = '';
  document.getElementById('checkinSuggestions').innerHTML = '';

  const overdue  = isOverdue(m.expiryDate);
  const ts       = new Date().toISOString();
  const checkin  = { id: uid(), memberId: m.id, memberName: m.name, plan: m.plan, timestamp: ts, overdue };

  state.checkins.push(checkin);
  m.lastCheckin = ts;

  await persistCheckin(checkin);
  await persistMember(m);

  if (overdue) showToast(`⚠ ${m.name} ingresó — membresía VENCIDA`, 'error');
  else showToast(`✓ ${m.name} registrado — ${PLANS[m.plan]?.name}`);

  renderTodayCheckins();
  renderDashboard();
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
  const active  = state.members.filter(m => !isOverdue(m.expiryDate)).length;
  const overdue = state.members.filter(m => isOverdue(m.expiryDate)).length;
  const todayStr = today();
  const checkins = state.checkins.filter(c => c.timestamp.startsWith(todayStr)).length;

  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const revenue = state.payments
    .filter(p => p.payDate.startsWith(thisMonth) && p.status === 'pagado')
    .reduce((s, p) => s + p.amount, 0);

  document.getElementById('stat-active').textContent   = active;
  document.getElementById('stat-overdue').textContent  = overdue;
  document.getElementById('stat-checkins').textContent = checkins;
  document.getElementById('stat-revenue').textContent  = formatCOP(revenue);

  // Last checkins (any day)
  const lastCI = state.checkins.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);
  const dCI = document.getElementById('dashboardCheckins');
  dCI.innerHTML = lastCI.length === 0
    ? '<div class="empty-state">No hay check-ins aún</div>'
    : lastCI.map(c => `
      <div class="checkin-item">
        <div class="checkin-avatar">${initials(c.memberName)}</div>
        <div class="checkin-info">
          <div class="checkin-name">${c.memberName}</div>
          <div class="checkin-meta"><span class="member-plan-chip" style="font-size:.65rem;padding:2px 6px">${c.plan}</span></div>
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
    { name:'Carlos Rodríguez', cedula:'1020405678', phone:'301 234 5678', email:'carlos@email.com', plan:'mensual', daysAgo:10 },
    { name:'Laura Gómez',      cedula:'1032456789', phone:'312 345 6789', email:'laura@email.com',  plan:'trimestral', daysAgo:40 },
    { name:'Andrés Martínez',  cedula:'79456321',   phone:'320 456 7890', email:'andres@email.com', plan:'anual', daysAgo:180 },
    { name:'Valentina Torres', cedula:'1015678901', phone:'315 567 8901', email:'vale@email.com',   plan:'mensual', daysAgo:35, notes:'Lesión rodilla' },
    { name:'Sebastián López',  cedula:'1000123456', phone:'300 678 9012', email:'seba@email.com',   plan:'semestral', daysAgo:20 },
  ];

  for (const dm of demos) {
    const d = new Date(); d.setDate(d.getDate() - dm.daysAgo);
    const startDate  = d.toISOString().slice(0, 10);
    const expiryDate = addMonths(startDate, PLANS[dm.plan].months);
    const m = { id:uid(), name:dm.name, cedula:dm.cedula, phone:dm.phone, email:dm.email, plan:dm.plan, startDate, expiryDate, notes:dm.notes||'', createdAt:startDate, lastCheckin:null };
    state.members.push(m);
    state.payments.push({ id:uid(), memberId:m.id, memberName:m.name, plan:dm.plan, amount:PLANS[dm.plan].price, payDate:startDate, expiryDate, method:'efectivo', status:'pagado' });
  }

  // 3 check-ins hoy
  state.members.slice(0, 3).forEach((m, i) => {
    const t = new Date(); t.setHours(6 + i * 2, 30, 0, 0);
    state.checkins.push({ id:uid(), memberId:m.id, memberName:m.name, plan:m.plan, timestamp:t.toISOString(), overdue:false });
  });

  saveLocal();
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
  renderDashboard();
});
