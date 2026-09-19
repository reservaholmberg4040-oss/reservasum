document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificamos primero si el usuario tiene sesión activa consultando al backend
  try {
    const checkRes = await fetch('/api/admin/dashboard');
    if (checkRes.status === 401) {
      showLoginForm();
      return; // Detenemos la ejecución si no está logueado
    }
  } catch (e) {
    showLoginForm();
    return;
  }

  // 2. Si está logueado, inicializamos todo el panel normalmente
  initAdminPanel();
});

// Función que dibuja el formulario de login si no hay sesión
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
        window.location.reload(); // Recarga para mostrar el panel completo
      } else {
        document.getElementById('login-error').innerText = 'Usuario o contraseña incorrectos';
      }
    } catch (err) {
      document.getElementById('login-error').innerText = 'Error de conexión';
    }
  });
}

// 3. Todo tu código original del panel de administración agrupado aquí
function initAdminPanel() {
  loadUnits();
  loadReportLog();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/admin/logout', { method: 'POST' });
      } catch (err) {
        // Ignoramos error de red para forzar la redirección de todos modos
      }
      window.location.href = '/admin';
    });
  }

  // --- Botón Descarga de Excel (Corregido y optimizado) ---
  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener('click', () => {
      // Buscamos de forma flexible el input de período en el DOM
      const periodInput = document.querySelector('input[type="month"]') || document.getElementById('month-select');
      let rawValue = periodInput ? periodInput.value : '';
      
      let period = '';
      if (rawValue && /^\d{4}-\d{2}$/.test(rawValue)) {
        period = rawValue;
      } else {
        // Si no hay valor válido, por defecto usamos el mes actual
        const now = new Date();
        period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      }

      // Redirige directamente al endpoint del servidor que descarga el Excel
      window.location.href = `/api/admin/download-report?period=${period}`;
    });
  }

  // Modal Agregar Unidad
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

  // Formulario Agregar Unidad
  const addForm = document.getElementById('add-unit-form');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const unidad = document.getElementById('input-unidad')?.value.trim();
      const piso = document.getElementById('input-piso')?.value.trim();
      const depto = document.getElementById('input-dto')?.value.trim(); // Corregido ID a input-dto
      const propietario = document.getElementById('input-propietario')?.value.trim();
      const pin = document.getElementById('input-pin')?.value.trim();

      try {
        // Ruta corregida a /api/admin/units/add (según tu routes/admin.js)
        let res = await fetch('/api/admin/units/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unidad, piso, depto, propietario, pin })
        });

        const result = await res.json();

        if (res.ok && result.success) {
          showModalFeedback('Unidad agregada correctamente.', 'success');
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

  // Importar Excel
  const btnUploadExcel = document.getElementById('btn-upload-excel');
  if (btnUploadExcel) {
    btnUploadExcel.addEventListener('click', async () => {
      const fileInput = document.getElementById('excel-file-input');
      const replaceAll = document.getElementById('chk-replace-all')?.checked || false;

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        return alert('Por favor seleccioná un archivo Excel.');
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
          alert(result.message || 'Importación completada.');
          fileInput.value = '';
          const chk = document.getElementById('chk-replace-all');
          if (chk) chk.checked = false;
          loadUnits();
        } else {
          alert('Error: ' + (result.error || 'No se pudo importar.'));
        }
      } catch (err) {
        alert('Error al subir el archivo Excel.');
      }
    });
  }

  // Seleccionar todas
  const selectAll = document.getElementById('select-all-units');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.unit-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }

  // Eliminar seleccionadas
  const btnDeleteSel = document.getElementById('btn-delete-selected');
  if (btnDeleteSel) {
    btnDeleteSel.addEventListener('click', async () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.unit-checkbox:checked'));
      if (checkedBoxes.length === 0) return alert('No seleccionaste ninguna unidad.');

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
            loadUnits();
          } else {
            alert('Error: ' + (result.error || 'No se pudieron eliminar.'));
          }
        } catch (err) {
          alert('Error de conexión.');
        }
      }
    });
  }

  // Eliminar TODAS
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
            loadUnits();
          } else {
            alert('Error: ' + (result.error || 'No se pudieron eliminar.'));
          }
        } catch (err) {
          alert('Error de conexión.');
        }
      }
    });
  }
}

// Mensaje dinámico elegante en el modal
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

// Cargar tabla con campos editables Inline y Checkbox de BAJA
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
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center; padding: 15px;">No hay unidades registradas.</td></tr>';
      return;
    }

    units.forEach(u => {
      const tr = document.createElement('tr');
      const unitId = u.id || u.unidad;
      const pisoDtoStr = u.piso && u.depto ? `${u.piso} ${u.depto}` : (u.piso || u.depto || '-'); // Corregido u.dto a u.depto

      // --- BAJA --- Definimos si está dada de baja
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
          <input type="text" maxlength="4" class="inline-edit" value="${u.pin || ''}" style="border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; width:70px; text-align:center; font-family:monospace;" onchange="updatePin('${unitId}', this.value)">
        </td>
        <td>
          <button class="btn-xs" style="padding: 4px 8px; font-size: 0.78rem; border-radius: 4px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff;" onclick="regeneratePin('${unitId}')">Regenerar PIN</button>
        </td>
        
        <!-- --- NUEVA CELDA BAJA --- con estilo centrado -->
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

    // --- BAJA --- Agregamos el evento a todos los checkboxes recién creados
    document.querySelectorAll('.unit-baja-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const unitId = e.target.dataset.unitId;
        const isChecked = e.target.checked;
