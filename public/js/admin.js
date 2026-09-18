document.addEventListener('DOMContentLoaded', () => {
    loadUnits();
    loadReportHistory();

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

    // Guardar unidad
    document.getElementById('add-unit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const unidad = document.getElementById('input-unidad').value.trim();
        const pisodto = document.getElementById('input-pisodto').value.trim();
        const propietario = document.getElementById('input-propietario').value.trim();
        const pin = document.getElementById('input-pin').value.trim();

        try {
            const res = await fetch('/api/units/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unidad, piso: pisodto, propietario, pin })
            });

            const result = await res.json();
            if (res.ok && result.success) {
                alert('Unidad agregada correctamente.');
                document.getElementById('add-unit-form').reset();
                modal.classList.remove('active');
                loadUnits();
            } else {
                alert('Error: ' + (result.error || 'No se pudo agregar la unidad.'));
            }
        } catch (err) {
            alert('Error al conectar con el servidor.');
        }
    });

    // Cargar Excel
    document.getElementById('btn-upload-excel').addEventListener('click', async () => {
        const fileInput = document.getElementById('excel-file-input');
        const replaceAll = document.getElementById('chk-replace-all').checked;

        if (!fileInput.files || fileInput.files.length === 0) {
            return alert('Por favor seleccioná un archivo Excel.');
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const res = await fetch(`/api/units/import-excel?replace=${replaceAll}`, {
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
                alert('Error: ' + (result.error || 'Ocurrió un problema.'));
            }
        } catch (err) {
            alert('Error al importar el archivo.');
        }
    });

    // Checkbox seleccionar todas
    document.getElementById('select-all-units').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.unit-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    // Eliminar seleccionadas
    document.getElementById('btn-delete-selected').addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('.unit-checkbox:checked'));
        if (checkedBoxes.length === 0) {
            return alert('No seleccionaste ninguna unidad.');
        }

        const idsToDelete = checkedBoxes.map(cb => cb.value);

        if (confirm(`¿Confirmás la eliminación de ${idsToDelete.length} unidad(es)?`)) {
            try {
                const res = await fetch('/api/units/delete', {
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
                    alert('Error: ' + (result.error || 'No se pudieron eliminar.'));
                }
            } catch (err) {
                alert('Error al conectar con el servidor.');
            }
        }
    });

    // Eliminar TODAS las unidades
    document.getElementById('btn-delete-all').addEventListener('click', async () => {
        const confirmStr = prompt('¡ATENCIÓN! Se eliminarán TODAS las unidades.\nEscribí "ELIMINAR" para confirmar:');
        if (confirmStr === 'ELIMINAR') {
            try {
                const res = await fetch('/api/units/delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deleteAll: true })
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert('Se eliminaron todas las unidades.');
                    loadUnits();
                } else {
                    alert('Error: ' + (result.error || 'No se pudieron eliminar.'));
                }
            } catch (err) {
                alert('Error de conexión.');
            }
        }
    });
});

// Cargar tabla de unidades con formateo exacto de PISO/DTO
async function loadUnits() {
    const tbody = document.getElementById('units-tbody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/units');
        const units = await res.json();

        tbody.innerHTML = '';
        if (!Array.isArray(units) || units.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No hay unidades registradas.</td></tr>';
            return;
        }

        units.forEach(u => {
            const tr = document.createElement('tr');
            const unitId = u.id || u.unidad;
            
            let pisoDtoStr = '-';
            if (u.piso && u.dto) {
                pisoDtoStr = u.piso.toString().startsWith('PB') ? `${u.piso} ${u.dto}` : `Piso ${u.piso} ${u.dto}`;
            } else if (u.piso) {
                pisoDtoStr = u.piso;
            } else if (u['piso/dto']) {
                pisoDtoStr = u['piso/dto'];
            }

            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="unit-checkbox" value="${unitId}">
                </td>
                <td><strong>${u.unidad || ''}</strong></td>
                <td>${pisoDtoStr}</td>
                <td>${u.propietario || ''}</td>
                <td><code>${u.pin || '----'}</code></td>
                <td>
                   <button class="btn btn-ghost btn-sm" onclick="alert('Unidad: ${u.unidad}\\nPIN: ${u.pin}')">Ver PIN</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Error al cargar las unidades.</td></tr>';
    }
}

// Historial
async function loadReportHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/admin/reports');
        if (!res.ok) return;
        const history = await res.json();

        tbody.innerHTML = '';
        if (!Array.isArray(history) || history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Todavía no se envió ningún informe</td></tr>';
            return;
        }

        history.forEach(item => {
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
