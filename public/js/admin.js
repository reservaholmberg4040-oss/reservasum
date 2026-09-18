document.addEventListener('DOMContentLoaded', () => {
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

  // --- Botón Descargar PDF optimizado con formato de período seguro ---
  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener('click', async () => {
      // Intentamos extraer el valor del período de cualquier selector o input cercano
      const periodInput = document.querySelector('input[type="month"], select, input[type="text"]');
      let rawValue = periodInput ? periodInput.value : '';
      
      let period = '';
      // Si el valor contiene un formato numérico válido YYYY-MM
      if (rawValue && /^\d{4}-\d{2}$/.test(rawValue)) {
        period = rawValue;
      } else {
        // Si el selector devuelve texto en español o formato extraño, por seguridad usamos el mes actual en curso
        period = new Date().toISOString().slice(0, 7);
      }

      try {
        // 1. Consultar los datos del reporte mensual al backend con el formato correcto
        const res = await fetch(`/api/admin/dashboard?period=${period}`);
        if (!res.ok) throw new Error('No se pudo obtener la información del reporte.');
        const data = await res.json();

        // 2. Buscar el contenedor principal o tarjeta donde se reflejará el informe
        let reportCard = document.querySelector('.admin-card');
        if (!reportCard) {
          alert('No se encontró el contenedor del reporte en la vista.');
          return;
        }

        // 3. Construir las filas de la tabla con las reservas agrupadas por unidad
        let rowsHtml = '';
        if (data.totalsByUnit && data.totalsByUnit.length > 0) {
          data.totalsByUnit.forEach(item => {
            rowsHtml += `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">Unidad ${item.unidad || item.id}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.propietario || 'Sin Propietario'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.count || item.total_turnos || 0}</td>
              </tr>`;
          });
        } else {
          rowsHtml = `<tr><td colspan="3" style="text-align: center; padding: 15px; color: #6b7280;">No hay reservas registradas para este período.</td></tr>`;
        }

        // Guardamos temporalmente el contenido original por si el usuario cancela la impresión
        const originalContent = reportCard.innerHTML;

        // 4. Inyectar la estructura formal del informe lista para imprimir
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
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `;

        // 5. Lanzar la impresión nativa del navegador
        window.print();

        // 6. Restaurar la vista original de la tarjeta al cerrar o terminar la impresión
        setTimeout(() => {
          reportCard.innerHTML = originalContent;
        }, 1000);

      } catch (err) {
        console.error('Error al generar el PDF:', err);
        alert('Ocurrió un error al preparar el reporte para imprimir.');
      }
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
      const dto = document.getElementById('input-dto')?.value.trim();
      const propietario = document.getElementById('input-propietario')?.value.trim();
      const pin = document.getElementById('input-pin')?.value.trim();

      try {
        let res = await fetch('/api/admin/units/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unidad, piso, dto, propietario, pin })
        });

        if (res.status === 404) {
          res = await fetch('/api/admin/add-unit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unidad, piso, dto, propietario, pin })
          });
        }

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
});

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
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center; padding: 15px;">No hay unidades registradas.</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center; padding: 15px;">Error al cargar unidades.</td></tr>';
  }
}

// Edición en tiempo real
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
