document.addEventListener('DOMContentLoaded', async () => {
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

  initAdminPanel();
});

// --- Sistema de Notificaciones Elegantes (Toasts) ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    alert(message);
    return;
  }

  const toast = document.createElement('div');
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.color = '#fff';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '500';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(10px)';

  if (type === 'success') {
    toast.style.backgroundColor = '#10b981';
  } else {
    toast.style.backgroundColor = '#ef4444';
  }

  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showLoginForm() {
  const container = document.body;
  container.innerHTML = `
    <div style="max-width: 400px; margin: 80px auto; padding: 30px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); font-family: Arial, sans-serif;">
      <h2 style="margin-bottom: 20px; color: #1f2937; text-align: center;">Administración Holmberg 4040</h2>
      <form id="login-form">
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #4b5563;">Usuario</label>
          <input type="text" id="username" autocomplete="username" required style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #4b5563;">Contraseña</label>
          <input type="password" id="password" autocomplete="current-password" required style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box;">
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
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

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
  loadBlockedDays();
  loadConfig();

  const configForm = document.getElementById('configForm');
  if (configForm) {
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const max_reservas_mes = document.getElementById('input-max-reservas').value;
      const max_reservas_semana = document.getElementById('input-max-reservas-semana').value;
      const dias_anticipacion_max = document.getElementById('input-dias-max').value;
      const dias_anticipacion_min = document.getElementById('input-dias-min').value;

      try {
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            max_reservas_mes, 
            max_reservas_semana, 
            dias_anticipacion_max, 
            dias_anticipacion_min 
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast('¡Configuración actualizada correctamente!', 'success');
        } else {
          showToast('Error al guardar: ' + (data.error || 'No se pudo actualizar.'), 'danger');
        }
      } catch (error) {
        showToast('Error de conexión al guardar la configuración.', 'danger');
      }
    });
  }

  const blockDayForm = document.getElementById('blockDayForm');
  if (blockDayForm) {
    blockDayForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('blockDate').value;
      const reason = document.getElementById('blockReason').value;

      try {
        const res = await fetch('/api/admin/blocked-days', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, reason })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast('Día bloqueado correctamente.', 'success');
          document.getElementById('blockDate').value = '';
          document.getElementById('blockReason').value = '';
          loadBlockedDays();
        } else {
          showToast(data.error || 'No se pudo bloquear el día.', 'danger');
        }
      } catch (err) {
        showToast('Error de conexión al bloquear el día.', 'danger');
      }
    });
  }

  const monthSelect = document.getElementById('month-select');
  if (monthSelect && !monthSelect.value) {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthSelect.value = currentPeriod;
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/admin/logout', { method: 'POST' });
      } catch (err) {}
      window.location.href = '/admin';
    });
  }

  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener('click', () => {
      const periodVal = monthSelect ? monthSelect.value : '';
      let period = '';
      if (periodVal && /^\d{4}-\d{2}$/.test(periodVal)) {
        period = periodVal;
      } else {
        const now = new Date();
        period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      }
      window.location.href = `/api/admin/download-report?period=${period}`;
    });
  }

  const modal = document.getElementById('add-unit-modal');
  const btnOpenModal = document.getElementById('btn-open-add-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');

  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener('click', () => {
      clearModalFeedback();
      modal.classList.add('active');
    });
  }

  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener('click', () => {
      modal.classList.remove('active');
      clearModalFeedback();
    });
  }

  const addForm = document.getElementById('add-unit-form');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const unidad = document.getElementById('input-unidad')?.value.trim();
      const piso = document.getElementById('input-piso')?.value.trim();
      const depto = document.getElementById('input-dto')?.value.trim();
      const propietario = document.getElementById('input-propietario')?.value.trim();
      const email = document.getElementById('input-email')?.value.trim();
      const pin = document.getElementById('input-pin')?.value.trim();

      try {
        let res = await fetch('/api/admin/units/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unidad, piso, depto, propietario, email, pin })
        });

        const result = await res.json();

        if (res.ok && result.success) {
          showToast('Unidad agregada correctamente.', 'success');
          addForm.reset();

          setTimeout(() => {
            if (modal) modal.classList.remove('active');
            clearModalFeedback();
            loadUnits();
          }, 1000);
        } else {
          showModalFeedback(result.error || 'No se pudo agregar la unidad.', 'danger');
        }
      } catch (err) {
        showModalFeedback('Error al conectar con el servidor.', 'danger');
      }
    });
  }

  const btnUploadExcel = document.getElementById('btn-upload-excel');
  if (btnUploadExcel) {
    btnUploadExcel.addEventListener('click', async () => {
      const fileInput = document.getElementById('excel-file-input');
      const replaceAll = document.getElementById('chk-replace-all')?.checked || false;

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast('Por favor seleccioná un archivo Excel.', 'danger');
        return;
      }

      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      try {
        const res = await fetch(`/api/admin/units/import-excel?replace=${replaceAll}`, {
          method: 'POST',
          body: formData
        });

        const result = await res.json();
        if (res.ok && result.success) {
          showToast(result.message || 'Importación completada.', 'success');
          fileInput.value = '';
          const chk = document.getElementById('chk-replace-all');
          if (chk) chk.checked = false;
          loadUnits();
        } else {
          showToast('Error: ' + (result.error || 'No se pudo importar.'), 'danger');
        }
      } catch (err) {
        showToast('Error al subir el archivo Excel.', 'danger');
      }
    });
  }

  const selectAll = document.getElementById('select-all-units');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.unit-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }

  const btnDeleteSel = document.getElementById('btn-delete-selected');
  if (btnDeleteSel) {
    btnDeleteSel.addEventListener('click', async () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.unit-checkbox:checked'));
      if (checkedBoxes.length === 0) {
        showToast('No seleccionaste ninguna unidad.', 'danger');
        return;
      }

      const idsToDelete = checkedBoxes.map(cb => cb.value);

      if (confirm(`¿Confirmás la eliminación de ${idsToDelete.length} unidad(es)?`)) {
        try {
          const res = await fetch('/api/admin/units/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: idsToDelete, deleteAll: false })
          });

          const result = await res.json();
          if (res.ok && result.success) {
            if (selectAll) selectAll.checked = false;
            showToast('Unidades eliminadas correctamente.', 'success');
            loadUnits();
          } else {
            showToast('Error: ' + (result.error || 'No se pudieron eliminar.'), 'danger');
          }
        } catch (err) {
          showToast('Error de conexión.', 'danger');
        }
      }
    });
  }

  const btnDeleteAll = document.getElementById('btn-delete-all');
  if (btnDeleteAll) {
    btnDeleteAll.addEventListener('click', async () => {
      const confirmStr = prompt('¡ATENCIÓN! Se eliminarán TODAS las unidades.\nEscribí "ELIMINAR" para confirmar:');
      if (confirmStr === 'ELIMINAR') {
        try {
          const res = await fetch('/api/admin/units/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteAll: true })
          });

          const result = await res.json();
          if (res.ok && result.success) {
            showToast('Todas las unidades fueron eliminadas.', 'success');
            loadUnits();
          } else {
            showToast('Error: ' + (result.error || 'No se pudieron eliminar.'), 'danger');
          }
        } catch (err) {
          showToast('Error de conexión.', 'danger');
        }
      }
    });
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/admin/config');
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.config) {
      const maxResInput = document.getElementById('input-max-reservas');
      const maxResSemanaInput = document.getElementById('input-max-reservas-semana');
      const maxAntInput = document.getElementById('input-dias-max');
      const minAntInput = document.getElementById('input-dias-min');

      if (maxResInput) maxResInput.value = data.config.max_reservas_mes || 4;
      if (maxResSemanaInput) maxResSemanaInput.value = data.config.max_reservas_semana || 1;
      if (maxAntInput) maxAntInput.value = data.config.dias_anticipacion_max || 60;
      if (minAntInput) minAntInput.value = data.config.dias_anticipacion_min !== undefined ? data.config.dias_anticipacion_min : 0;
    }
  } catch (error) {
    console.error('Error al cargar la configuración:', error);
  }
}

async function loadBlockedDays() {
  const list = document.getElementById('blockedDaysList');
  if (!list) return;

  try {
    const res = await fetch('/api/admin/blocked-days');
    if (!res.ok) return;
    const days = await res.json();

    if (!Array.isArray(days) || days.length === 0) {
      list.innerHTML = '<p style="color: #666; font-size: 0.9rem; margin: 0;">No hay días bloqueados actualmente.</p>';
      return;
    }

    list.innerHTML = days.map(b => `
      <li style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
        <span><b>${b.date}</b> — ${b.reason}</span>
        <button onclick="unblockDay('${b.date}')" class="btn btn-xs" style="background: #ef4444; color: white; border: none;">Desbloquear</button>
      </li>
    `).join('');
  } catch (e) {
    list.innerHTML = '<p style="color: #dc2626; font-size: 0.9rem;">Error al cargar días bloqueados.</p>';
  }
}

window.unblockDay = async function(date) {
  if (!confirm(`¿Estás seguro de que deseas desbloquear el día ${date}?`)) return;

  try {
    const res = await fetch(`/api/admin/blocked-days/${date}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Bloqueo removido con éxito.', 'success');
      loadBlockedDays();
    } else {
      showToast('Error al quitar el bloqueo.', 'danger');
    }
  } catch (err) {
    showToast('Error de conexión.', 'danger');
  }
};

function showModalFeedback(text, type) {
  let feedbackEl = document.getElementById('modal-feedback-alert');
  const form = document.getElementById('add-unit-form');

  if (!feedbackEl && form) {
    feedbackEl = document.createElement('div');
    feedbackEl.id = 'modal-feedback-alert';
    feedbackEl.style.padding = '10px 14px';
    feedbackEl.style.marginBottom = '14px';
    feedbackEl.style.borderRadius = '6px';
    feedbackEl.style.fontSize = '0.9rem';
    feedbackEl.style.fontWeight = '500';
    form.parentNode.insertBefore(feedbackEl, form);
  }

  if (feedbackEl) {
    if (type === 'success') {
      feedbackEl.style.backgroundColor = '#d1fae5';
      feedbackEl.style.color = '#065f46';
      feedbackEl.style.border = '1px solid #a7f3d0';
    } else {
      feedbackEl.style.backgroundColor = '#fee2e2';
      feedbackEl.style.color = '#991b1b';
      feedbackEl.style.border = '1px solid #fca5a5';
    }
    feedbackEl.textContent = text;
    feedbackEl.style.display = 'block';
  }
}

function clearModalFeedback() {
  const feedbackEl = document.getElementById('modal-feedback-alert');
  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
  }
}

async function loadUnits() {
  const tbody = document.getElementById('units-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/units');
    if (res.status === 401) { window.location.reload(); return; }
    if (!res.ok) return;
    const units = await res.json();

    tbody.innerHTML = '';
    if (!Array.isArray(units) || units.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align:center; padding: 15px;">No hay unidades registradas.</td></tr>';
      return;
    }

    units.forEach(u => {
      const tr = document.createElement('tr');
      const unitId = u.id || u.unidad;
      
      // Corrección aplicada para unir correctamente piso y departamento
      const pisoVal = u.piso || '';
      const deptoVal = u.depto || '';
      const pisoDtoStr = (pisoVal || deptoVal) ? `${pisoVal} ${deptoVal}`.trim() : '-';
      
      const isBaja = u.baja === true;

      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="unit-checkbox" value="${unitId}">
        </td>
        <td><strong>${u.unidad || ''}</strong></td>
        <td>${pisoDtoStr}</td>
        <td>
          <input type="text" class="inline-edit" value="${u.propietario || ''}" style="border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; width:100%; box-sizing:border-box;" onchange="updatePropietario('${unitId}', this.value)">
        </td>
        <td>
          <input type="email" class="inline-edit" value="${u.email || ''}" placeholder="correo@ejemplo.com" style="border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; width:100%; box-sizing:border-box;" onchange="updateEmail('${unitId}', this.value)">
        </td>
        <td>
          <input type="text" maxlength="4" class="inline-edit" value="${u.pin || ''}" style="border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; width:70px; text-align:center; font-family:monospace;" onchange="updatePin('${unitId}', this.value)">
        </td>
        <td>
          <button class="btn-xs" onclick="regeneratePin('${unitId}')">Regenerar PIN</button>
        </td>
        <td style="text-align: center;">
          <input type="checkbox" 
                 class="unit-baja-checkbox" 
                 data-unit-id="${unitId}" 
                 ${isBaja ? 'checked' : ''} 
                 style="cursor: pointer; transform: scale(1.2); accent-color: #dc2626;">
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.unit-baja-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const unitId = e.target.dataset.unitId;
        const isChecked = e.target.checked;
        updateUnitBaja(unitId, isChecked);
      });
    });

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align:center; padding: 15px;">Error al cargar unidades.</td></tr>';
  }
}

window.updatePin = async (unitId, newPin) => {
  if (!/^\d{4}$/.test(newPin)) {
    showToast('El PIN debe tener exactamente 4 dígitos numéricos.', 'danger');
    return loadUnits();
  }

  try {
    const res = await fetch(`/api/admin/units/${unitId}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin })
    });

    if (res.ok) {
      showToast('PIN actualizado correctamente.', 'success');
    } else {
      const err = await res.json();
      showToast('Error: ' + (err.error || 'No se pudo guardar el PIN.'), 'danger');
      loadUnits();
    }
  } catch (err) {
    showToast('Error al conectar con el servidor.', 'danger');
    loadUnits();
  }
};

window.updatePropietario = async (unitId, newOwner) => {
  if (!newOwner.trim()) {
    showToast('El propietario no puede quedar vacío.', 'danger');
    return loadUnits();
  }

  try {
    const res = await fetch(`/api/admin/units/${unitId}/propietario`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propietario: newOwner })
    });

    if (res.ok) {
      showToast('Propietario actualizado con éxito.', 'success');
    } else {
      const err = await res.json();
      showToast('Error: ' + (err.error || 'No se pudo guardar el propietario.'), 'danger');
      loadUnits();
    }
  } catch (err) {
    showToast('Error al conectar con el servidor.', 'danger');
    loadUnits();
  }
};

window.updateEmail = async (unitId, newEmail) => {
  try {
    const res = await fetch(`/api/admin/units/${unitId}/email`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail })
    });

    if (res.ok) {
      showToast('Correo electrónico actualizado.', 'success');
    } else {
      const err = await res.json();
      showToast('Error: ' + (err.error || 'No se pudo guardar el email.'), 'danger');
      loadUnits();
    }
  } catch (err) {
    showToast('Error al conectar con el servidor.', 'danger');
    loadUnits();
  }
};

window.regeneratePin = async (unitId) => {
  try {
    const res = await fetch(`/api/admin/units/${unitId}/regenerate-pin`, {
      method: 'POST'
    });

    if (res.ok) {
      showToast('PIN regenerado con éxito.', 'success');
      loadUnits();
    } else {
      const err = await res.json();
      showToast('Error: ' + (err.error || 'No se pudo regenerar.'), 'danger');
    }
  } catch (err) {
    showToast('Error al conectar con el servidor.', 'danger');
  }
};

async function updateUnitBaja(unitId, isBaja) {
  try {
    const res = await fetch(`/api/admin/units/${unitId}/baja`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baja: isBaja })
    });

    if (res.ok) {
      showToast(isBaja ? 'Unidad dada de baja correctamente.' : 'Unidad reactivada.', 'success');
    } else {
      const err = await res.json();
      const cb = document.querySelector(`.unit-baja-checkbox[data-unit-id="${unitId}"]`);
      if (cb) cb.checked = !isBaja; 
      showToast('Error: ' + (err.error || 'No se pudo actualizar el estado de la unidad.'), 'danger');
    }
  } catch (err) {
    const cb = document.querySelector(`.unit-baja-checkbox[data-unit-id="${unitId}"]`);
    if (cb) cb.checked = !isBaja;
    showToast('Error al conectar con el servidor.', 'danger');
  }
}

async function loadReportLog() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/report-log');
    if (res.status === 401) { window.location.reload(); return; }
    if (!res.ok) return;
    const log = await res.json();

    tbody.innerHTML = '';
    if (!Array.isArray(log) || log.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Todavía no se envió ningún informe</td></tr>';
      return;
    }

    log.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.period || '-'}</td>
        <td>${item.sentAt ? new Date(item.sentAt).toLocaleString('es-AR') : '-'}</td>
        <td>${item.recipient || '-'}</td>
        <td><span class="badge badge-success">${item.status || 'ENVIADO'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Todavía no se envió ningún informe</td></tr>';
  }
}
