// ---------- Utilidades ----------
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW = ['L','M','M','J','V','S','D'];
const LS_KEY = 'sum_holmberg_mis_reservas';

function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function todayISO() { const t = new Date(); return toISODate(t.getFullYear(), t.getMonth(), t.getDate()); }

function getMisReservas() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveMisReservas(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
function addMisReserva(r) {
  const list = getMisReservas().filter(x => x.id !== r.id);
  list.push(r);
  saveMisReservas(list);
}
function removeMisReserva(id) {
  saveMisReservas(getMisReservas().filter(x => x.id !== id));
}
function findMisReserva(id) {
  return getMisReservas().find(x => x.id === id);
}

function toast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------- Estado ----------
let currentYear = new Date().getFullYear();
let units = [];
let reservationsByDate = {}; // { 'YYYY-MM-DD': { dia: reservation|null, noche: reservation|null } }
let selectedDate = null;

// ---------- Carga inicial ----------
async function init() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (cfg.buildingName) document.getElementById('buildingName').textContent = cfg.buildingName;

  units = await fetch('/api/units').then(r => r.json());
  populateUnitSelect();

  document.getElementById('yearLabel').textContent = currentYear;
  await loadYear(currentYear);
  renderYearGrid();

  setupTabs();
  setupYearSwitcher();
  setupModals();
  renderMisReservas();
}

async function loadYear(year) {
  const rows = await fetch(`/api/reservations?year=${year}`).then(r => r.json());
  reservationsByDate = {};
  for (const r of rows) {
    if (!reservationsByDate[r.date]) reservationsByDate[r.date] = { dia: null, noche: null };
    reservationsByDate[r.date][r.turno] = r;
  }
}

function populateUnitSelect() {
  const sel = document.getElementById('unitSelect');
  sel.innerHTML = '<option value="">Seleccioná tu unidad...</option>' +
    units.map(u => `<option value="${u.id}" data-owner="${u.propietario}">${u.piso === 'PB' ? 'PB ' + u.dto : 'Piso ' + u.piso + ' ' + u.dto} — ${u.propietario}</option>`).join('');
}

// ---------- Tabs ----------
function setupTabs() {
  document.querySelectorAll('.nav-links a[data-tab]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-links a[data-tab]').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      const tab = a.dataset.tab;
      document.getElementById('tab-calendario').style.display = tab === 'calendario' ? '' : 'none';
      document.getElementById('tab-misreservas').style.display = tab === 'misreservas' ? '' : 'none';
      if (tab === 'misreservas') renderMisReservas();
    });
  });
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
    btn.addEventListener('click', () => handleTurnoAction(btn.dataset.action, iso, btn.dataset.turno, btn.dataset.id));
  });

  toggleOverlay('dayOverlay', true);
}

function renderTurnoCard(iso, turno, reserva, isPast) {
  const label = turno === 'dia' ? '☀️ Turno Día' : '🌙 Turno Noche';
  if (reserva) {
    const mine = !!findMisReserva(reserva.id);
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
        ${mine && !isPast ? `
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" data-action="edit" data-turno="${turno}" data-id="${reserva.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-action="cancel" data-turno="${turno}" data-id="${reserva.id}">Cancelar</button>
          </div>` : mine ? `<p class="sub" style="margin:0">Tu reserva (fecha pasada)</p>` : ``}
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

function handleTurnoAction(action, iso, turno, id) {
  toggleOverlay('dayOverlay', false);
  if (action === 'new') openFormModal({ mode: 'new', date: iso, turno });
  if (action === 'edit') openFormModal({ mode: 'edit', date: iso, turno, id });
  if (action === 'cancel') doCancel(id);
}

// ---------- Formulario de reserva ----------
function openFormModal({ mode, date, turno, id }) {
  document.getElementById('formAlert').innerHTML = '';
  document.getElementById('reservaForm').reset();
  document.getElementById('reservaDate').value = date;
  document.getElementById('reservaTurno').value = turno;
  document.getElementById('reservaEditId').value = id || '';
  document.getElementById('formModalSub').textContent = `${fmtFecha(date)} — ${turno === 'dia' ? 'Turno Día ☀️' : 'Turno Noche 🌙'}`;
  document.getElementById('submitReservaBtn').textContent = mode === 'edit' ? 'Guardar cambios' : 'Confirmar reserva';

  if (mode === 'edit') {
    const mine = findMisReserva(id);
    if (mine) {
      document.getElementById('unitSelect').value = mine.unit_id;
      document.getElementById('nombreInput').value = mine.nombre;
      document.getElementById('apellidoInput').value = mine.apellido;
    }
  }
  toggleOverlay('formOverlay', true);
}

async function onSubmitReserva(e) {
  e.preventDefault();
  const date = document.getElementById('reservaDate').value;
  const turno = document.getElementById('reservaTurno').value;
  const editId = document.getElementById('reservaEditId').value;
  const unit_id = Number(document.getElementById('unitSelect').value);
  const nombre = document.getElementById('nombreInput').value.trim();
  const apellido = document.getElementById('apellidoInput').value.trim();
  const alertBox = document.getElementById('formAlert');
  alertBox.innerHTML = '';

  if (!unit_id) { alertBox.innerHTML = `<div class="alert alert-error">Elegí una unidad.</div>`; return; }

  try {
    let res, data;
    if (editId) {
      const mine = findMisReserva(Number(editId));
      res = await fetch(`/api/reservations/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edit_token: mine ? mine.edit_token : null, date, turno, nombre, apellido })
      });
      data = await res.json();
      if (!res.ok) throw data;
      addMisReserva({ ...data, edit_token: mine.edit_token });
      toast('Reserva actualizada ✔', 'success');
    } else {
      res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, turno, unit_id, nombre, apellido })
      });
      data = await res.json();
      if (!res.ok) throw data;
      addMisReserva(data);
      toast('¡Turno reservado con éxito! 🎉', 'success');
    }
    toggleOverlay('formOverlay', false);
    await loadYear(currentYear);
    renderYearGrid();
    renderMisReservas();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.error || 'Ese turno ya está ocupado. Elegí otro.'}</div>`;
  }
}

async function doCancel(id) {
  if (!confirm('¿Seguro que querés cancelar esta reserva?')) return;
  const mine = findMisReserva(Number(id));
  const res = await fetch(`/api/reservations/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edit_token: mine ? mine.edit_token : null })
  });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'No se pudo cancelar', 'error'); return; }
  removeMisReserva(Number(id));
  toast('Reserva cancelada', 'success');
  await loadYear(currentYear);
  renderYearGrid();
  renderMisReservas();
}

// ---------- Mis reservas ----------
function renderMisReservas() {
  const list = getMisReservas().sort((a, b) => a.date.localeCompare(b.date));
  const cont = document.getElementById('misReservasList');
  if (!list.length) {
    cont.innerHTML = `<div class="empty-state"><div class="big">📅</div>Todavía no reservaste ningún turno desde este dispositivo.</div>`;
    return;
  }
  cont.innerHTML = list.map(r => {
    const isPast = r.date < todayISO();
    const unidadLabel = r.piso === 'PB' ? `PB ${r.dto}` : `Piso ${r.piso} ${r.dto}`;
    return `
    <div class="mr-item">
      <div class="info">
        <b>${fmtFecha(r.date)} — ${r.turno === 'dia' ? 'Turno Día ☀️' : 'Turno Noche 🌙'}</b>
        Unidad ${unidadLabel} · ${r.nombre} ${r.apellido}
      </div>
      <div class="mr-actions">
        ${!isPast ? `
          <button class="btn btn-outline btn-sm" data-edit="${r.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-cancel="${r.id}">Cancelar</button>` : `<span class="sub">Pasada</span>`}
      </div>
    </div>`;
  }).join('');

  cont.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const r = findMisReserva(Number(b.dataset.edit));
    openFormModal({ mode: 'edit', date: r.date, turno: r.turno, id: r.id });
  }));
  cont.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => doCancel(b.dataset.cancel)));
}

init();
