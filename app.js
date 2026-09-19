// ---------- Utilidades ----------
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW = ['L','M','M','J','V','S','D'];

function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function todayISO() { const t = new Date(); return toISODate(t.getFullYear(), t.getMonth(), t.getDate()); }

function toast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// Solución definitiva para que muestre bien el piso y el departamento/dto sin undefined
function unitLabel(u) {
  const piso = u.piso !== undefined && u.piso !== null ? u.piso : (u.floor || '');
  const dto = u.dto !== undefined && u.dto !== null ? u.dto : (u.departamento || u.letter || '');
  const prop = u.propietario !== undefined && u.propietario !== null ? u.propietario : (u.owner || '');
  
  const ubicacion = piso === 'PB' ? `PB ${dto}` : `Piso ${piso} ${dto}`;
  return `${ubicacion.trim()} — ${prop}`;
}

// ---------- Estado ----------
let currentYear = new Date().getFullYear();
let units = [];
let reservationsByDate = {}; 
let selectedDate = null;
let currentPinUnit = null; 
let isSubmittingReservation = false;

// ---------- Carga inicial ----------
async function init() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (cfg.buildingName) {
    const bName = document.getElementById('buildingName');
    if (bName) bName.textContent = cfg.buildingName;
  }

  units = await fetch('/api/units').then(r => r.json());
  populateUnitSelect('unitSelect');
  populateUnitSelect('misUnitSelect');

  const yLabel = document.getElementById('yearLabel');
  if (yLabel) yLabel.textContent = currentYear;
  
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
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccioná la unidad...</option>' +
    units.map(u => `<option value="${u.unidad || u.id}">${unitLabel(u)}</option>`).join('');
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
  const tabCal = document.getElementById('tab-calendario');
  const tabMis = document.getElementById('tab-misreservas');
  if (tabCal) tabCal.style.display = tab === 'calendario' ? '' : 'none';
  if (tabMis) tabMis.style.display = tab === 'misreservas' ? '' : 'none';
  if (tab === 'misreservas' && preselectUnitId) {
    const misUnit = document.getElementById('misUnitSelect');
    const misPin = document.getElementById('misPinInput');
    if (misUnit) misUnit.value = preselectUnitId;
    if (misPin) misPin.focus();
  }
}

// ---------- Year switcher ----------
function setupYearSwitcher() {
  const prevBtn = document.getElementById('prevYear');
  const nextBtn = document.getElementById('nextYear');
  const yLabel = document.getElementById('yearLabel');

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      currentYear--;
      if (yLabel) yLabel.textContent = currentYear;
      await loadYear(currentYear);
      renderYearGrid();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      currentYear++;
      if (yLabel) yLabel.textContent = currentYear;
      await loadYear(currentYear);
      renderYearGrid();
    });
  }
}

// ---------- Render calendario anual ----------
function renderYearGrid() {
  const grid = document.getElementById('yearGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const today = todayISO();

  for (let m = 0; m < 12; m++) {
    const card = document.createElement('div');
    card.className = 'month-card';

    const firstDow = (new Date(currentYear, m, 1).getDay() + 6) % 7; 
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
  const closeDay = document.getElementById('closeDayModal');
  const dayOv = document.getElementById('dayOverlay');
  const closeForm = document.getElementById('closeFormModal');
  const formOv = document.getElementById('formOverlay');
  const form = document.getElementById('reservaForm');

  if (closeDay) closeDay.addEventListener('click', () => toggleOverlay('dayOverlay', false));
  if (dayOv) dayOv.addEventListener('click', (e) => { if (e.target.id === 'dayOverlay') toggleOverlay('dayOverlay', false); });
  if (closeForm) closeForm.addEventListener('click', () => toggleOverlay('formOverlay', false));
  if (formOv) formOv.addEventListener('click', (e) => { if (e.target.id === 'formOverlay') toggleOverlay('formOverlay', false); });
  if (form) form.addEventListener('submit', onSubmitReserva);
}

function toggleOverlay(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('show', show);
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return `${dias[dt.getDay()]} ${d} de ${MESES[m - 1]} ${y}`;
}

function openDayModal(iso) {
  selectedDate = iso;
  const title = document.getElementById('dayModalTitle');
  const sub = document.getElementById('dayModalSub');
  if (title) title.textContent = fmtFecha(iso);
  
  const isPast = iso < todayISO();
  if (sub) sub.textContent = isPast ? 'Fecha pasada' : 'Elegí un turno para ver el detalle o reservar';

  const info = reservationsByDate[iso] || { dia: null, noche: null };
  const cont = document.getElementById('turnosContainer');
  if (!cont) return;

  cont.innerHTML = ['dia', 'noche'].map(turno => renderTurnoCard(iso, turno, info[turno], isPast)).join('');

  cont.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleTurnoAction(btn.dataset.action, iso, btn.dataset.turno, btn.dataset.id, btn.dataset.unit));
  });

  toggleOverlay('dayOverlay', true);
}

function renderTurnoCard(iso, turno, reserva, isPast) {
  const label = turno === 'dia' ? '☀️ Turno Día' : '🌙 Turno Noche';
  if (reserva) {
    const pisoVal = reserva.piso !== undefined && reserva.piso !== null ? reserva.piso : (reserva.floor || '');
    const dtoVal = reserva.dto !== undefined && reserva.dto !== null ? reserva.dto : (reserva.departamento || reserva.letter || '');
    const unidadLabel = pisoVal === 'PB' ? `PB ${dtoVal}` : `Piso ${pisoVal} ${dtoVal}`;
    return `
      <div class="turno-card">
        <div class="turno-head">
          <span class="turno-badge ${turno}">${label}</span>
          <span class="status-pill ocupado">Ocupado</span>
        </div>
        <div class="turno-info">
          <b>Unidad:</b> ${unidadLabel.trim()} (${reserva.propietario || ''})<br>
          <b>Reservó:</b> ${reserva.nombre || ''} ${reserva.apellido || ''}
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
  const alertBox = document.getElementById('formAlert');
  const form = document.getElementById('reservaForm');
  const rDate = document.getElementById('reservaDate');
  const rTurno = document.getElementById('reservaTurno');
  const rEditId = document.getElementById('reservaEditId');
  const sub = document.getElementById('formModalSub');
  const submitBtn = form?.querySelector('button[type="submit"]');

  if (alertBox) alertBox.innerHTML = '';
  if (form) form.reset();
  if (rDate) rDate.value = date;
  if (rTurno) rTurno.value = turno;
  if (rEditId) rEditId.value = id || '';
  if (sub) sub.textContent = `${fmtFecha(date)} — ${turno === 'dia' ? 'Turno Día ☀️' : 'Turno Noche 🌙'}`;
  if (submitBtn) submitBtn.textContent = mode === 'edit' ? 'Guardar cambios' : 'Confirmar reserva';

  const unitSel = document.getElementById('unitSelect');
  const pinInput = document.getElementById('unitPinInput');
  if (unitSel && pinInput) {
    if (mode === 'edit') {
      unitSel.value = unitId;
      unitSel.disabled = true;
      pinInput.value = unitPin || (currentPinUnit ? currentPinUnit.pin : '');
    } else {
      unitSel.disabled = false;
      pinInput.value = currentPinUnit ? currentPinUnit.pin : '';
      if (currentPinUnit) unitSel.value = currentPinUnit.id;
    }
  }
  toggleOverlay('formOverlay', true);
}

async function onSubmitReserva(e) {
  e.preventDefault();

  if (isSubmittingReservation) return;
  isSubmittingReservation = true;

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : 'Confirmar reserva';

  const date = document.getElementById('reservaDate')?.value;
  const turno = document.getElementById('reservaTurno')?.value;
  const editId = document.getElementById('reservaEditId')?.value;
  const unit_pin = document.getElementById('unitPinInput')?.value.trim();
  const unit_id = document.getElementById('unitSelect')?.value;
  const nombre = document.getElementById('nombreInput')?.value.trim();
  const apellido = document.getElementById('apellidoInput')?.value.trim();
  const alertBox = document.getElementById('formAlert');

  if (alertBox) alertBox.innerHTML = '';

  if (!unit_id) {
    if (alertBox) alertBox.innerHTML = `<div class="alert alert-error">Elegí una unidad.</div>`;
    isSubmittingReservation = false;
    return;
  }
  if (!/^\d{4}$/.test(unit_pin)) {
    if (alertBox) alertBox.innerHTML = `<div class="alert alert-error">Ingresá el PIN de 4 dígitos de la unidad.</div>`;
    isSubmittingReservation = false;
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
  }

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
        body: JSON.stringify({ date, turno, unit_id, nombre, apellido, unit_pin })
      });
      data = await res.json();
      if (!res.ok) throw data;
      toast('¡Turno reservado con éxito! 🎉', 'success');
      currentPinUnit = { id: unit_id, pin: unit_pin };
    }

    // Cerramos ambos modales para evitar que quede superpuesto o congelado
    toggleOverlay('formOverlay', false);
    toggleOverlay('dayOverlay', false);

    await loadYear(currentYear);
    renderYearGrid();
    if (currentPinUnit) await loadMisReservas();
  } catch (err) {
    if (alertBox) {
      alertBox.innerHTML = `<div class="alert alert-error">${err.error || 'Ese turno ya está ocupado. Elegí otro.'}</div>`;
    }
  } finally {
    isSubmittingReservation = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
}

async function doCancel(id) {
  const itemElement = document.querySelector(`[data-cancel="${id}"]`)?.closest('.mr-item');
  if (!itemElement) return;

  if (itemElement.querySelector('.confirm-box')) return;

  const confirmBox = document.createElement('div');
  confirmBox.className = 'confirm-box';
  confirmBox.style.cssText = 'margin-top: 10px; padding: 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px;';
  confirmBox.innerHTML = `
    <span style="font-size: 0.9rem; color: #ef4444; font-weight: 500;">¿Seguro que querés cancelar esta reserva?</span>
    <div style="display: flex; gap: 6px;">
      <button class="btn btn-danger btn-sm confirm-yes" style="padding: 4px 10px;">Sí, cancelar</button>
      <button class="btn btn-outline btn-sm confirm-no" style="padding: 4px 10px;">No</button>
    </div>
  `;

  itemElement.appendChild(confirmBox);

  confirmBox.querySelector('.confirm-yes').addEventListener('click', async () => {
    confirmBox.innerHTML = `<span style="font-size: 0.9rem; color: #666;">Cancelando...</span>`;
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_pin: currentPinUnit ? currentPinUnit.pin : '' })
      });
      const data = await res.json();
      if (!res.ok) { 
        toast(data.error || 'No se pudo cancelar', 'error'); 
        confirmBox.remove();
        return; 
      }
      toast('Reserva cancelada', 'success');
      await loadYear(currentYear);
      renderYearGrid();
      await loadMisReservas();
    } catch (err) {
      toast('Error al procesar la cancelación', 'error');
      confirmBox.remove();
    }
  });

  confirmBox.querySelector('.confirm-no').addEventListener('click', () => {
    confirmBox.remove();
  });
}

// ---------- Mis reservas (unidad + PIN) ----------
function setupPinForm() {
  const pinForm = document.getElementById('pinForm');
  const misLockBtn = document.getElementById('misLockBtn');

  if (pinForm) {
    pinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const unitId = document.getElementById('misUnitSelect')?.value;
      const pin = document.getElementById('misPinInput')?.value.trim();
      const alertBox = document.getElementById('pinAlert');
      if (alertBox) alertBox.innerHTML = '';

      if (!unitId) { 
        if (alertBox) alertBox.innerHTML = `<div class="alert alert-error">Elegí tu unidad.</div>`; 
        return; 
      }

      const res = await fetch(`/api/units/${unitId}/verify-pin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (alertBox) alertBox.innerHTML = `<div class="alert alert-error">${data.error || 'PIN incorrecto.'}</div>`;
        return;
      }

      const unit = units.find(u => String(u.unidad) === String(unitId) || String(u.id) === String(unitId));
      currentPinUnit = { id: unitId, pin };
      
      const pinAccCard = document.getElementById('pinAccessCard');
      const pinUnlWrap = document.getElementById('pinUnlockedWrap');
      const misUnTitle = document.getElementById('misUnitTitle');

      if (pinAccCard) pinAccCard.style.display = 'none';
      if (pinUnlWrap) pinUnlWrap.style.display = '';
      if (misUnTitle) misUnTitle.textContent = unit ? unitLabel(unit) : 'Unidad';
      await loadMisReservas();
    });
  }

  if (misLockBtn) {
    misLockBtn.addEventListener('click', () => {
      currentPinUnit = null;
      const pinAccCard = document.getElementById('pinAccessCard');
      const pinUnlWrap = document.getElementById('pinUnlockedWrap');
      const misPinInput = document.getElementById('misPinInput');

      if (pinAccCard) pinAccCard.style.display = '';
      if (pinUnlWrap) pinUnlWrap.style.display = 'none';
      if (misPinInput) misPinInput.value = '';
    });
  }
}

async function loadMisReservas() {
  if (!currentPinUnit) return;
  const list = await fetch(`/api/reservations?unit_id=${currentPinUnit.id}`).then(r => r.json());
  renderMisReservas(list.sort((a, b) => a.date.localeCompare(b.date)));
}

function renderMisReservas(list) {
  const cont = document.getElementById('misReservasList');
  if (!cont) return;

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
        ${r.nombre || ''} ${r.apellido || ''}
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
