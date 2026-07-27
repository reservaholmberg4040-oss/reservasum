// ---------- Utilidades ----------
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW = ['L','M','M','J','V','S','D'];

function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function todayISO() { const t = new Date(); return toISODate(t.getFullYear(), t.getMonth(), t.getDate()); }

function toast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function unitLabel(u) {
  return `${u.piso === 'PB' ? 'PB ' + u.dto : 'Piso ' + u.piso + ' ' + u.dto} — ${u.propietario}`;
}

// ---------- Estado ----------
let currentYear = new Date().getFullYear();
let units = [];
let reservationsByDate = {}; // { 'YYYY-MM-DD': { dia: reservation|null, noche: reservation|null } }
let selectedDate = null;
let currentPinUnit = null; // { id, pin } — unidad "desbloqueada" en la pestaña Mis Reservas

// ---------- Carga inicial ----------
async function init() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (cfg.buildingName) document.getElementById('buildingName').textContent = cfg.buildingName;

  units = await fetch('/api/units').then(r => r.json());
  populateUnitSelect('unitSelect');
  populateUnitSelect('misUnitSelect');

  document.getElementById('yearLabel').textContent = currentYear;
  await loadYear(currentYear);
  renderYearGrid();

  setupTabs();
  setupYearSwitcher();
  setupModals();
  setupPinForm();
}

async function loadYear(year) {
  const rows = await fetch(`/api/reservations?year=${year}`).then(r => r.json());
  reservationsByDate = {};
  for (const r of rows) {
    if (!reservationsByDate[r.date]) reservationsByDate[r.date] = { dia: null, noche: null };
    reservationsByDate[r.date][r.turno] = r;
  }
}

function populateUnitSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Seleccioná la unidad...</option>' +
    units.map(u => `<option value="${u.id}">${unitLabel(u)}</option>`).join('');
}

// ---------- Tabs ----------
function setupTabs() {
  document.querySelectorAll('.nav-links a[data-tab]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      goToTab(a.dataset.tab);
    });
  });
}

function goToTab(tab, preselectUnitId) {
  document.querySelectorAll('.nav-links a[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  document.getElementById('tab-calendario').style.display = tab === 'calendario' ? '' : 'none';
  document.getElementById('tab-misreservas').style.display = tab === 'misreservas' ? '' : 'none';
  if (tab === 'misreservas' && preselectUnitId) {
    document.getElementById('misUnitSelect').value = preselectUnitId;
    document.getElementById('misPinInput').focus();
  }
}

// ---------- Year switcher ----------
function setupYearSwitcher() {
  document.getElementById('prevYear').addEventListener('click', async () => {
    currentYear--;
    document.getElementById('yearLabel').textContent = currentYear;
    await loadYear(currentYear);
    renderYearGrid();
  });
  document.getElementById('nextYear').addEventListener('click', async () => {
    currentYear++;
    document.getElementById('yearLabel').textContent = currentYear;
    await loadYear(currentYear);
    renderYearGrid();
  });
}

// ---------- Render calendario anual ----------
function renderYearGrid() {
  const grid = document.getElementById('yearGrid');
  grid.innerHTML = '';
  const today = todayISO();

  for (let m = 0; m < 12; m++) {
    const card = document.createElement('div');
    card.className = 'month-card';

    const firstDow = (new Date(currentYear, m, 1).getDay() + 6) % 7; // lunes=0
    const daysInMonth = new Date(currentYear, m + 1, 0).getDate();

    let html = `<h3>${MESES[m]} ${currentYear}</h3>`;
    html += `<div class="dow-row">${DOW.map(d => `<span>${d}</span>`).join('')}</div>`;
    html += `<div class="days-grid">`;

    for (let i = 0; i < firstDow; i++) html += `<div class="day-cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISODate(currentYear, m, d);
      const info = reservationsByDate[iso] || { dia: null, noche: null };
      const isPast = iso < today;
      const isToday = iso === today;
      html += `<div class="day-cell ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}" data-date="${iso}">
        <span class="day-num">${d}</span>
        <div class="day-marks">
          <i class="${info.dia ? 'on-dia' : ''}"></i>
          <i class="${info.noche ? 'on-noche' : ''}"></i>
        </div>
      </div>`;
    }
    html += `</div>`;
    card.innerHTML = html;
    grid.appendChild(card);
  }

  grid.querySelectorAll('.day-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => openDayModal(cell.dataset.date));
  });
}

// ---------- Modal de día ----------
function setupModals() {
  document.getElementById('closeDayModal').addEventListener('click', () => toggleOverlay('dayOverlay', false));
  document.getElementById('dayOverlay').addEventListener('click', (e) => { if (e.target.id === 'dayOverlay') toggleOverlay('dayOverlay', false); });
  document.getElementById('closeFormModal').addEventListener('click', () => toggleOverlay('formOverlay', false));
  document.getElementById('formOverlay').addEventListener('click', (e) => { if (e.target.id === 'formOverlay') toggleOverlay('formOverlay', false); });
  document.getElementById('reservaForm').addEventListener('submit', onSubmitReserva);
}

function toggleOverlay(id, show) {
  document.getElementById(id).classList.toggle('show', show);
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return `${dias[dt.getDay()]} ${d} de ${MESES[m - 1]} ${y}`;
}

function openDayModal(iso) {
  selectedDate = iso;
  document.getElementById('dayModalTitle').textContent = fmtFecha(iso);
  const isPast = iso < todayISO();
  document.getElementById('dayModalSub').textContent = isPast ? 'Fecha pasada' : 'Elegí un turno para ver el detalle o reservar';

  const info = reservationsByDate[iso] || { dia: null, noche: null };
  const cont = document.getElementById('turnosContainer');
  cont.innerHTML = ['dia', 'noche'].map(turno => renderTurnoCard(iso, turno, info[turno], isPast)).join('');

  cont.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleTurnoAction(btn.dataset.action, iso, btn.dataset.turno, btn.dataset.id, Number(btn.dataset.unit)));
  });

  toggleOverlay('dayOverlay', true);
}

function renderTurnoCard(iso, turno, reserva, isPast) {
  const label = turno === 'dia' ? '☀️ Turno Día' : '🌙 Turno Noche';
  if (reserva) {
    const unidadLabel = reserva.piso === 'PB' ? `PB ${reserva.dto}` : `Piso ${reserva.piso} ${reserva.dto}`;
    return `
      <div class="turno-card">
        <div class="turno-head">
          <span class="turno-badge ${turno}">${label}</span>
          <span class="status-pill ocupado">Ocupado</span>
        </div>
        <div class="turno-info">
          <b>Unidad:</b> ${unidadLabel} (${reserva.propietario})<br>
          <b>Reservó:</b> ${reserva.nombre} ${reserva.apellido}
        </div>
        ${!isPast ? `<button class="btn btn-outline btn-sm" data-action="manage" data-unit="${reserva.unit_id}">Gestionar esta reserva (con PIN)</button>` : ''}
      </div>`;
  }
  return `
    <div class="turno-card">
      <div class="turno-head">
        <span class="turno-badge ${turno}">${label}</span>
        <span class="status-pill libre">Libre</span>
      </div>
      ${isPast
        ? `<p class="sub" style="margin:0">Fecha pasada</p>`
        : `<button class="btn btn-primary btn-block" data-action="new" data-turno="${turno}">Reservar este turno</button>`}
    </div>`;
}

function handleTurnoAction(action, iso, turno, id, unitId) {
  toggleOverlay('dayOverlay', false);
  if (action === 'new') openFormModal({ mode: 'new', date: iso, turno });
  if (action === 'manage') goToTab('misreservas', unitId);
}

// ---------- Formulario de reserva (crear / editar) ----------
function openFormModal({ mode, date, turno, id, unitId, unitPin }) {
  document.getElementById('formAlert').innerHTML = '';
  document.getElementById('reservaForm').reset();
  document.getElementById('reservaDate').value = date;
  document.getElementById('reservaTurno').value = turno;
  document.getElementById('reservaEditId').value = id || '';
  document.getElementById('reservaUnitPin').value = unitPin || '';
  document.getElementById('formModalSub').textContent = `${fmtFecha(date)} — ${turno === 'dia' ? 'Turno Día ☀️' : 'Turno Noche 🌙'}`;
  document.getElementById('submitReservaBtn').textContent = mode === 'edit' ? 'Guardar cambios' : 'Confirmar reserva';

  const unitSel = document.getElementById('unitSelect');
  if (mode === 'edit') {
    unitSel.value = unitId;
    unitSel.disabled = true;
  } else {
    unitSel.disabled = false;
  }
  toggleOverlay('formOverlay', true);
}

async function onSubmitReserva(e) {
  e.preventDefault();
  const date = document.getElementById('reservaDate').value;
  const turno = document.getElementById('reservaTurno').value;
  const editId = document.getElementById('reservaEditId').value;
  const unit_pin = document.getElementById('reservaUnitPin').value;
  const unit_id = Number(document.getElementById('unitSelect').value);
  const nombre = document.getElementById('nombreInput').value.trim();
  const apellido = document.getElementById('apellidoInput').value.trim();
  const alertBox = document.getElementById('formAlert');
  alertBox.innerHTML = '';

  if (!unit_id) { alertBox.innerHTML = `<div class="alert alert-error">Elegí una unidad.</div>`; return; }

  try {
    let res, data;
    if (editId) {
      res = await fetch(`/api/reservations/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_pin, date, turno, nombre, apellido })
      });
      data = await res.json();
      if (!res.ok) throw data;
      toast('Reserva actualizada ✔', 'success');
    } else {
      res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, turno, unit_id, nombre, apellido })
      });
      data = await res.json();
      if (!res.ok) throw data;
      toast('¡Turno reservado con éxito! 🎉', 'success');
    }
    toggleOverlay('formOverlay', false);
    await loadYear(currentYear);
    renderYearGrid();
    if (currentPinUnit) await loadMisReservas();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.error || 'Ese turno ya está ocupado. Elegí otro.'}</div>`;
  }
}

async function doCancel(id) {
  if (!confirm('¿Seguro que querés cancelar esta reserva?')) return;
  const res = await fetch(`/api/reservations/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unit_pin: currentPinUnit ? currentPinUnit.pin : '' })
  });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'No se pudo cancelar', 'error'); return; }
  toast('Reserva cancelada', 'success');
  await loadYear(currentYear);
  renderYearGrid();
  await loadMisReservas();
}

// ---------- Mis reservas (unidad + PIN) ----------
function setupPinForm() {
  document.getElementById('pinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const unitId = document.getElementById('misUnitSelect').value;
    const pin = document.getElementById('misPinInput').value.trim();
    const alertBox = document.getElementById('pinAlert');
    alertBox.innerHTML = '';

    if (!unitId) { alertBox.innerHTML = `<div class="alert alert-error">Elegí tu unidad.</div>`; return; }

    const res = await fetch(`/api/units/${unitId}/verify-pin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alertBox.innerHTML = `<div class="alert alert-error">${data.error || 'PIN incorrecto.'}</div>`;
      return;
    }

    const unit = units.find(u => u.id === Number(unitId));
    currentPinUnit = { id: Number(unitId), pin };
    document.getElementById('pinAccessCard').style.display = 'none';
    document.getElementById('pinUnlockedWrap').style.display = '';
    document.getElementById('misUnitTitle').textContent = unit ? unitLabel(unit) : 'Unidad';
    await loadMisReservas();
  });

  document.getElementById('misLockBtn').addEventListener('click', () => {
    currentPinUnit = null;
    document.getElementById('pinAccessCard').style.display = '';
    document.getElementById('pinUnlockedWrap').style.display = 'none';
    document.getElementById('misPinInput').value = '';
  });
}

async function loadMisReservas() {
  if (!currentPinUnit) return;
  const list = await fetch(`/api/reservations?unit_id=${currentPinUnit.id}`).then(r => r.json());
  renderMisReservas(list.sort((a, b) => a.date.localeCompare(b.date)));
}

function renderMisReservas(list) {
  const cont = document.getElementById('misReservasList');
  if (!list.length) {
    cont.innerHTML = `<div class="empty-state"><div class="big">📅</div>Esta unidad todavía no tiene reservas.</div>`;
    return;
  }
  cont.innerHTML = list.map(r => {
    const isPast = r.date < todayISO();
    return `
    <div class="mr-item">
      <div class="info">
        <b>${fmtFecha(r.date)} — ${r.turno === 'dia' ? 'Turno Día ☀️' : 'Turno Noche 🌙'}</b>
        ${r.nombre} ${r.apellido}
      </div>
      <div class="mr-actions">
        ${!isPast ? `
          <button class="btn btn-outline btn-sm" data-edit="${r.id}" data-unit="${r.unit_id}" data-date="${r.date}" data-turno="${r.turno}">Editar</button>
          <button class="btn btn-danger btn-sm" data-cancel="${r.id}">Cancelar</button>` : `<span class="sub">Pasada</span>`}
      </div>
    </div>`;
  }).join('');

  cont.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    openFormModal({ mode: 'edit', date: b.dataset.date, turno: b.dataset.turno, id: b.dataset.edit, unitId: b.dataset.unit, unitPin: currentPinUnit.pin });
  }));
  cont.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => doCancel(b.dataset.cancel)));
}

init();
