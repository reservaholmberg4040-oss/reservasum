function toast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

let unitsCount = 0;

async function init() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (cfg.buildingName) document.getElementById('buildingName').textContent = cfg.buildingName;

  const me = await fetch('/api/admin/me').then(r => r.json());
  if (me.isAdmin) {
    showDashboard();
  } else {
    document.getElementById('loginWrap').style.display = 'flex';
  }

  document.getElementById('loginForm').addEventListener('submit', onLogin);
  document.getElementById('logoutBtn').addEventListener('click', onLogout);
  document.getElementById('downloadBtn').addEventListener('click', () => {
    const period = document.getElementById('periodSelect').value;
    window.location.href = `/api/admin/report.xlsx?period=${period}`;
  });
  document.getElementById('sendMailBtn').addEventListener('click', onSendMail);
}

async function onLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  const alertBox = document.getElementById('loginAlert');
  alertBox.innerHTML = '';
  const res = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) {
    alertBox.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
    return;
  }
  showDashboard();
}

async function onLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
}

async function showDashboard() {
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('dashboardWrap').style.display = '';
  document.getElementById('logoutBtn').style.display = '';

  const units = await fetch('/api/units').then(r => r.json());
  unitsCount = units.length;
  document.getElementById('statTotalUnidades').textContent = unitsCount;

  document.getElementById('periodSelect').addEventListener('change', loadDashboard);
  await loadDashboard(currentPeriod());
}

async function loadDashboard(periodOrEvent) {
  const period = typeof periodOrEvent === 'string' ? periodOrEvent : document.getElementById('periodSelect').value;
  const data = await fetch(`/api/admin/dashboard?period=${period}`).then(r => r.json());

  const sel = document.getElementById('periodSelect');
  const cp = currentPeriod();
  const periodos = Array.from(new Set([cp, ...data.periodosDisponibles])).sort().reverse();
  sel.innerHTML = periodos.map(p => `<option value="${p}" ${p === data.period ? 'selected' : ''}>${p}</option>`).join('');

  document.getElementById('statTotalReservas').textContent = data.totalReservasMes;
  document.getElementById('statUnidadesActivas').textContent = data.unidadesActivas;

  document.getElementById('resumenBody').innerHTML = data.totalsByUnit.map(t => `
    <tr>
      <td>${t.unidad}</td>
      <td>${t.piso === 'PB' ? 'PB' : 'Piso ' + t.piso} ${t.dto}</td>
      <td>${t.propietario}</td>
      <td>${t.turnos_dia}</td>
      <td>${t.turnos_noche}</td>
      <td><b>${t.total_turnos}</b></td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Sin reservas en este período</td></tr>`;

  await loadReservas(data.period);
  await loadLog();
  await loadPins();
}

async function loadReservas(period) {
  const [from, to] = [`${period}-01`, `${period}-31`];
  const rows = await fetch(`/api/reservations?from=${from}&to=${to}`).then(r => r.json());
  document.getElementById('reservasBody').innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.turno === 'dia' ? '☀️ Día' : '🌙 Noche'}</td>
      <td>${r.piso === 'PB' ? 'PB' : 'Piso ' + r.piso} ${r.dto} (${r.propietario})</td>
      <td>${r.nombre} ${r.apellido}</td>
      <td><button class="btn btn-danger btn-sm" data-del="${r.id}">Eliminar</button></td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Sin reservas</td></tr>`;

  document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta reserva?')) return;
    const res = await fetch(`/api/reservations/${b.dataset.del}`, { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: '{}' });
    if (res.ok) { toast('Reserva eliminada', 'success'); loadDashboard(document.getElementById('periodSelect').value); }
    else toast('No se pudo eliminar', 'error');
  }));
}

async function loadLog() {
  const logs = await fetch('/api/admin/report-log').then(r => r.json());
  document.getElementById('logBody').innerHTML = logs.map(l => `
    <tr>
      <td>${l.period}</td>
      <td>${new Date(l.sent_at).toLocaleString('es-AR')}</td>
      <td>${l.recipient || '-'}</td>
      <td>${l.status.startsWith('error') ? `<span style="color:#991b1b">${l.status}</span>` : `<span style="color:#065f46">✔ ${l.status}</span>`}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Todavía no se envió ningún informe</td></tr>`;
}

async function loadPins() {
  const units = await fetch('/api/admin/units').then(r => r.json());
  document.getElementById('pinsBody').innerHTML = units.map(u => `
    <tr>
      <td>${u.unidad}</td>
      <td>${u.piso === 'PB' ? 'PB' : 'Piso ' + u.piso} ${u.dto}</td>
      <td>
        <input type="text" value="${(u.propietario || '').replace(/"/g, '&quot;')}" data-propietario-input="${u.id}"
          style="width:220px;padding:6px 8px;border-radius:8px;border:1px solid var(--border)">
      </td>
      <td>
        <input type="text" maxlength="4" pattern="\\d{4}" value="${u.pin}" data-pin-input="${u.id}"
          style="width:70px;text-align:center;font-weight:700;letter-spacing:2px;padding:6px 8px;border-radius:8px;border:1px solid var(--border)">
      </td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" data-save="${u.id}">Guardar</button>
        <button class="btn btn-outline btn-sm" data-regen-pin="${u.id}">🎲 Nuevo PIN</button>
      </td>
    </tr>`).join('');

  document.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.save;
    const pinInput = document.querySelector(`[data-pin-input="${id}"]`);
    const propInput = document.querySelector(`[data-propietario-input="${id}"]`);
    const pin = pinInput.value.trim();
    const propietario = propInput.value.trim();

    if (!/^\d{4}$/.test(pin)) { toast('El PIN debe tener 4 dígitos', 'error'); return; }
    if (!propietario) { toast('El propietario no puede quedar vacío', 'error'); return; }

    const [resPin, resProp] = await Promise.all([
      fetch(`/api/admin/units/${id}/pin`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
      }),
      fetch(`/api/admin/units/${id}/propietario`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propietario })
      })
    ]);

    if (resPin.ok && resProp.ok) { toast('Unidad actualizada ✔', 'success'); loadDashboard(document.getElementById('periodSelect').value); }
    else toast('No se pudo actualizar', 'error');
  }));

  document.querySelectorAll('[data-regen-pin]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.regenPin;
    if (!confirm('¿Generar un PIN nuevo para esta unidad? El anterior dejará de funcionar.')) return;
    const res = await fetch(`/api/admin/units/${id}/regenerate-pin`, { method: 'POST' });
    if (res.ok) { toast('Nuevo PIN generado ✔', 'success'); loadPins(); } else toast('No se pudo regenerar', 'error');
  }));
}

async function onSendMail() {
  const period = document.getElementById('periodSelect').value;
  const recipient = prompt('¿A qué mail enviar el informe? (dejalo vacío para usar el configurado por defecto)');
  const res = await fetch('/api/admin/send-report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period, recipient: recipient || undefined })
  });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'Error al enviar el mail', 'error'); return; }
  toast(`Informe de ${period} enviado ✔`, 'success');
  loadLog();
}

init();
