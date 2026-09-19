document.addEventListener('DOMContentLoaded', async () => {
  // Verificar si hay sesión activa consultando al backend
  try {
    const checkRes = await fetch('/api/admin/dashboard');
    if (checkRes.status === 401) {
      showLoginForm();
      return;
    }
  } catch (e) {
    showLoginForm();
    return;
  }

  // Si pasa, inicializar el panel normal
  initAdminPanel();
});

function showLoginForm() {
  const container = document.querySelector('body') || document.getElementById('app');
  container.innerHTML = `
    <div style="max-width: 400px; margin: 80px auto; padding: 30px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); font-family: Arial, sans-serif;">
      <h2 style="margin-bottom: 20px; color: #1f2937; text-align: center;">Administración Holmberg 4040</h2>
      <form id="login-form">
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #4b5563;">Usuario</label>
          <input type="text" id="username" required style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #4b5563;">Contraseña</label>
          <input type="password" id="password" required style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box;">
        </div>
        <button type="submit" style="width: 100%; padding: 10px; background: #4f46e5; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Ingresar</button>
        <div id="login-error" style="color: #dc2626; font-size: 13px; margin-top: 10px; text-align: center;"></div>
      </form>
      <div style="text-align: center; margin-top: 20px;">
        <a href="/" style="color: #4f46e5; font-size: 14px; text-decoration: none;">← Volver al calendario</a>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      if (res.ok) {
        window.location.reload();
      } else {
        document.getElementById('login-error').innerText = 'Usuario o contraseña incorrectos';
      }
    } catch (err) {
      document.getElementById('login-error').innerText = 'Error de conexión';
    }
  });
}

function initAdminPanel() {
  loadUnits();
  loadReportLog();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/admin/logout', { method: 'POST' });
      } catch (err) {}
      window.location.href = '/admin';
    });
  }

  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener('click', async () => {
      const periodInput = document.querySelector('input[type="month"], select, input[type="text"]');
      let rawValue = periodInput ? periodInput.value : '';
      let period = (rawValue && /^\d{4}-\d{2}$/.test(rawValue)) ? rawValue : new Date().toISOString().slice(0, 7);

      try {
        const res = await fetch(`/api/admin/dashboard?period=${period}`);
        if (!res.ok) throw new Error();
        const data = await res.json();

        let reportCard = document.querySelector('.admin-card');
        if (!reportCard) return;

        let rowsHtml = '';
        if (data.totalsByUnit && data.totalsByUnit.length > 0) {
          data.totalsByUnit.forEach(item => {
            rowsHtml += `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">Unidad ${item.unidad || item.id}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.propietario || 'Sin Propietario'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.total_turnos || 0}</td>
              </tr>`;
          });
        } else {
          rowsHtml = `<tr><td colspan="3" style="text-align: center; padding: 15px; color: #6b7280;">No hay reservas registradas para este período.</td></tr>`;
        }

        const originalContent = reportCard.innerHTML;
        reportCard.innerHTML = `
          <div style="font-family: Arial, sans-serif; color: #111; padding: 10px;">
            <h2 style="margin-bottom: 5px; color: #1f2937;">Informe Mensual de Reservas</h2>
            <p style="color: #4b5563; font-size: 14px; margin-top: 0;">Período consultado: <b>${data.period}</b></p>
            <div style="display: flex; gap: 30px; margin: 15px 0; font-size: 14px; background: #f9fafb; padding: 10px; border-radius: 6px;">
              <div><b>Total de Reservas del Mes:</b> ${data.totalReservasMes}</div>
              <div><b>Unidades Activas:</b> ${data.unidadesActivas}</div>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
              <thead>
                <tr style="background: #f4f5fb; text-align: left;">
                  <th style="padding: 10px; border-bottom: 2px solid #d1d5db;">Unidad</th>
                  <th style="padding: 10px; border-bottom: 2px solid #d1d5db;">Propietario</th>
                  <th style="padding: 10px; border-bottom: 2px solid #d1d5db; text-align: center;">Cant. Reservas</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;

        window.print();
        setTimeout(() => { reportCard.innerHTML = originalContent; }, 1000);
      } catch (err) {
        alert('Ocurrió un error al preparar el reporte para imprimir.');
      }
    });
  }
}

async function loadUnits() {
  const tbody = document.getElementById('units-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/units');
    if (res.status === 401) { window.location.reload(); return; }
    const units = await res.json();
    tbody.innerHTML = '';
    if (!Array.isArray(units) || units.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center; padding: 15px;">No hay unidades registradas.</td></tr>';
      return;
    }
    units.forEach(u => {
      const tr = document.createElement('tr');
      const unitId = u.id || u.unidad;
      const pisoDtoStr = u.piso && u.dto ? `${u.piso} ${u.dto}` : (u.piso || u.dto || '-');
      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="unit-checkbox" value="${unitId}"></td>
        <td><strong>${u.unidad || ''}</strong></td>
        <td>${pisoDtoStr}</td>
        <td>${u.propietario || ''}</td>
        <td>${u.pin || ''}</td>
        <td>-</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center; padding: 15px;">Error al cargar unidades.</td></tr>';
  }
}

async function loadReportLog() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Todavía no se envió ningún informe</td></tr>';
}
