const XLSX = require('xlsx');
const db = require('../db');

/**
 * Genera un informe mensual de reservas para facturar a las unidades de forma segura.
 * @param {string} period - "YYYY-MM"
 */
function buildMonthlyReport(period) {
  try {
    // Obtenemos las filas de forma segura, intentando usar byPeriod o filtrando all() como respaldo
    let rows = [];
    if (db.reservations && typeof db.reservations.byPeriod === 'function') {
      rows = db.reservations.byPeriod(period) || [];
    } else if (db.reservations && typeof db.reservations.all === 'function') {
      const allRes = db.reservations.all() || [];
      rows = allRes.filter(r => (r.date || '').startsWith(period));
    }

    // Totales por unidad (para cobrar expensas)
    const totalsMap = {};
    for (const r of rows) {
      const key = r.unidad || r.unit || 'S/N';
      if (!totalsMap[key]) {
        totalsMap[key] = { 
          unidad: r.unidad || r.unit || 'S/N', 
          piso: r.piso || '', 
          dto: r.dto || '', 
          propietario: r.propietario || 'Sin Propietario', 
          turnos_dia: 0, 
          turnos_noche: 0, 
          total_turnos: 0, 
          fechas: [] 
        };
      }
      if (r.turno === 'dia') totalsMap[key].turnos_dia++;
      else totalsMap[key].turnos_noche++;
      totalsMap[key].total_turnos++;
      totalsMap[key].fechas.push(`${r.date || ''} (${r.turno === 'dia' ? 'Día' : 'Noche'})`);
    }

    const totalsByUnit = Object.values(totalsMap)
      .map(t => ({ ...t, fechas: t.fechas.sort() }))
      .sort((a, b) => String(a.unidad).localeCompare(String(b.unidad)));

    const detailSheetData = rows.map(r => ({
      Fecha: r.date || '',
      Turno: r.turno === 'dia' ? 'Día' : 'Noche',
      Unidad: r.unidad || '',
      Piso: r.piso || '',
      Dto: r.dto || '',
      Propietario: r.propietario || '',
      'Reservado por': `${r.nombre || ''} ${r.apellido || ''}`.trim(),
      'Fecha de reserva': r.created_at || ''
    }));

    const summarySheetData = totalsByUnit.map(t => ({
      Unidad: t.unidad,
      Piso: t.piso,
      Dto: t.dto,
      Propietario: t.propietario,
      'Turnos Día': t.turnos_dia,
      'Turnos Noche': t.turnos_noche,
      'Total Turnos': t.total_turnos,
      'Días reservados': t.fechas.join(', ')
    }));

    let buffer = null;
    try {
      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summarySheetData.length > 0 ? summarySheetData : [{ Mensaje: 'Sin datos' }]);
      const wsDetail = XLSX.utils.json_to_sheet(detailSheetData.length > 0 ? detailSheetData : [{ Mensaje: 'Sin datos' }]);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen por Unidad');
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle de Reservas');
      buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (e) {
      console.error('Error generando Excel:', e);
    }

    const filename = `informe-reservas-SUM-Holmberg4040-${period}.xlsx`;

    return { buffer, filename, rows, totalsByUnit };
  } catch (err) {
    console.error('Error crítico en buildMonthlyReport:', err);
    return { buffer: null, filename: `informe-${period}.xlsx`, rows: [], totalsByUnit: [] };
  }
}

module.exports = { buildMonthlyReport };
