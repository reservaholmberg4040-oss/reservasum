document.addEventListener('DOMContentLoaded', () => {
  loadUnits();
  loadReportLog();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.href = '/admin';
    });
  }

  // Modal Agregar Unidad
  const modal = document.getElementById('add-unit-modal');
  document.getElementById('btn-open-add-modal').addEventListener('click', () => modal.classList.add('active'));
  document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('active'));

  // Guardar nueva unidad
  document.getElementById('add-unit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const unidad = document.getElementById('input-unidad').value.trim();
    const piso = document.getElementById('input-piso').value.trim();
    const dto = document.getElementById('input-dto').value.trim();
    const propietario = document.getElementById('input-propietario').value.trim();
    const pin = document.getElementById('input-pin').value.trim();

    try {
      const res = await fetch('/api/admin/units/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidad, piso, dto, propietario, pin })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        alert('Unidad agregada correctamente.');
        document.getElementById('add-unit-form').reset();
        modal.classList.remove('active');
        loadUnits();
      } else {
        alert('Error: ' + (result.error || 'No se pudo agregar.'));
      }
    } catch (err) {
      alert('Error de conexión.');
    }
  });

  // Importar Excel
  document.getElementById('btn-upload-excel').addEventListener('click', async () => {
    const fileInput = document.getElementById('excel-file-input');
    const replaceAll = document.getElementById('chk-replace-all').checked;

    if (!fileInput.files || fileInput.files.length === 0) {
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
        alert(result.message);
        fileInput.value = '';
        document.getElementById('chk-replace-all').checked = false;
        loadUnits();
      } else {
        alert('Error: ' + (result.error || 'No se pudo importar.'));
      }
    } catch (err) {
      alert('Error al subir el archivo Excel.');
    }
  });

  // Seleccionar todas
  document.getElementById('select-all-units').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.unit-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });

  // Eliminar seleccionadas
  document.getElementById('btn-delete-selected').addEventListener('click', async () => {
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
          alert('Unidades eliminadas correctamente.');
          document.getElementById('select-all-units').checked = false;
          loadUnits();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (err) {
        alert('Error de conexión.');
      }
    }
  });

  // Eliminar TODAS
  document.getElementById('btn-delete-all').addEventListener('click', async () => {
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
          alert('Todas las unidades fueron eliminadas.');
          loadUnits();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (err) {
        alert('Error de conexión.');
      }
    }
  });
});

// Cargar tabla con campos editables Inline
async function loadUnits() {
  const tbody = document.getElementById('units-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/units');
    if (!res.ok) return;
    const units = await res.json();

    tbody.innerHTML = '';
    if (!Array.isArray(units) || units.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No hay unidades registradas.</td></tr>';
      return;
    }

    units.forEach(u => {
      const tr = document.createElement('tr');
      const unitId = u.id || u.unidad;
      const pisoDtoStr = u.piso && u.dto ? `${u.piso} ${u.dto}` : (u.piso || u.dto || '-');

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
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Error al cargar unidades.</td></tr>';
  }
}

// Edición en tiempo real directamente en la tabla
window.updatePin = async (unitId, newPin) => {
  if (!/^\d{4}$/.test(newPin)) {
    alert('El PIN debe tener exactamente 4 dígitos numéricos.');
    return loadUnits();
  }

  try {
    const res = await fetch(`/api/admin/units/${unitId}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar el PIN.'));
      loadUnits();
    }
  } catch (err) {
    alert('Error al conectar con el servidor.');
    loadUnits();
  }
};

window.updatePropietario = async (unitId, newOwner) => {
  if (!newOwner.trim()) {
    alert('El propietario no puede quedar vacío.');
    return loadUnits();
  }

  try {
    const res = await fetch(`/api/admin/units/${unitId}/propietario`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propietario: newOwner })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar el propietario.'));
      loadUnits();
    }
  } catch (err) {
    alert('Error al conectar con el servidor.');
    loadUnits();
  }
};

window.regeneratePin = async (unitId) => {
  try {
    const res = await fetch(`/api/admin/units/${unitId}/regenerate-pin`, {
      method: 'POST'
    });

    if (res.ok) {
      loadUnits();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo regenerar.'));
    }
  } catch (err) {
    alert('Error al conectar con el servidor.');
  }
};

async function loadReportLog() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/report-log');
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
