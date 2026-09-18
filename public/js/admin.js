document.addEventListener('DOMContentLoaded', () => {
    loadUnits();

    // Modal para agregar unidad
    const modal = document.getElementById('add-unit-modal');
    document.getElementById('btn-open-add-modal').addEventListener('click', () => modal.classList.add('active'));
    document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('active'));

    // Submit del formulario de agregar unidad
    document.getElementById('add-unit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const unidad = document.getElementById('input-unidad').value.trim();
        const piso = document.getElementById('input-piso').value.trim();
        const depto = document.getElementById('input-depto').value.trim();
        const propietario = document.getElementById('input-propietario').value.trim();

        try {
            const res = await fetch('/api/units/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unidad, piso, depto, propietario })
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
            alert('Error de conexión al agregar la unidad.');
        }
    });

    // Cargar Excel
    document.getElementById('btn-upload-excel').addEventListener('click', async () => {
        const fileInput = document.getElementById('excel-file-input');
        const replaceAll = document.getElementById('chk-replace-all').checked;

        if (!fileInput.files || fileInput.files.length === 0) {
            return alert('Por favor seleccioná un archivo Excel (.xlsx o .xls).');
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
                alert('Error al importar Excel: ' + (result.error || 'Ocurrió un problema.'));
            }
        } catch (err) {
            alert('Error de conexión al subir el archivo Excel.');
        }
    });

    // Seleccionar/Deseleccionar todas las casillas de la tabla
    document.getElementById('select-all-units').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.unit-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    // Eliminar seleccionadas
    document.getElementById('btn-delete-selected').addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('.unit-checkbox:checked'));
        if (checkedBoxes.length === 0) {
            return alert('No has seleccionado ninguna unidad para eliminar.');
        }

        const idsToDelete = checkedBoxes.map(cb => cb.value);

        if (confirm(`¿Estás seguro de que deseas eliminar ${idsToDelete.length} unidad(es)?`)) {
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
                    alert('Error: ' + (result.error || 'No se pudieron eliminar las unidades.'));
                }
            } catch (err) {
                alert('Error de conexión al eliminar unidades.');
            }
        }
    });

    // Eliminar TODAS las unidades
    document.getElementById('btn-delete-all').addEventListener('click', async () => {
        const confirmStr = prompt('¡ATENCIÓN! Esta acción borrará TODAS las unidades registradas.\nPara confirmar, escribe la palabra "ELIMINAR":');
        
        if (confirmStr === 'ELIMINAR') {
            try {
                const res = await fetch('/api/units/delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deleteAll: true })
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert('Todas las unidades fueron eliminadas.');
                    loadUnits();
                } else {
                    alert('Error: ' + (result.error || 'No se pudieron eliminar las unidades.'));
                }
            } catch (err) {
                alert('Error de conexión al vaciar la base de datos de unidades.');
            }
        }
    });
});

// Función para cargar la lista de unidades en la tabla
async function loadUnits() {
    const tbody = document.getElementById('units-table-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando unidades...</td></tr>';

    try {
        const res = await fetch('/api/units');
        const units = await res.json();

        tbody.innerHTML = '';
        if (!Array.isArray(units) || units.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay unidades registradas.</td></tr>';
            return;
        }

        units.forEach(u => {
            const tr = document.createElement('tr');
            const unitId = u.id || u.unidad;
            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="unit-checkbox" value="${unitId}">
                </td>
                <td>${u.unidad || ''}</td>
                <td>${u.piso || ''}</td>
                <td>${u.depto || ''}</td>
                <td>${u.propietario || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error al cargar las unidades.</td></tr>';
    }
}
