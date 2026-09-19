const XLSX = require('xlsx');
const db = require('../db');

/**
 * Genera un informe mensual de reservas de forma totalmente segura.
 * @param {string} period - "YYYY-MM"
 */
function buildMonthlyReport(period) {
  let allRows = [];
  try {
    // Intentamos usar el método nativo si existe, o caemos en un filtrado seguro sobre all()
    if (db.reservations && typeof db.reservations.byPeriod === 'function') {
      allRows = db.reservations.byPeriod(period) || [];
    } else if (db.reservations && typeof db.reservations.all === 'function') {
      const rawAll = db.reservations.all() || [];
      allRows = rawAll.filter(r => {
        const d = r.date || r.fecha || '';
        return d.startsWith(period);
      });
    }
  } catch (e) {
    console.error('Error al obtener reservas para el reporte:', e);
    allRows = [];
  }

  const totalsMap = {};
  for (const r of allRows) {
    const key = r.unidad || r.unit || 'S/N';
    if (!totalsMap[key]) {
      totalsMap[key] = { 
        unidad: key, 
        piso: r.piso || '', 
        dto: r.dto || '', 
        propietario: r.propietario || 'Sin Propietario', 
        turnos_dia: 0, 
        turnos_noche: 0, 
        total_turnos: 0, 
        fechas: [] 
      };
    }
    const turno = r.turno || r.shift || 'dia';
    if (turno === 'dia') totalsMap[key].turnos_dia++;
    else totalsMap[key].turnos_noche++;
    totalsMap[key].total_turnos++;
    
    const fechaRes = r.date || r.fecha || '';
    totalsMap[key].fechas.push(`${fechaRes} (${turno === 'dia' ? 'Día' : 'Noche'})`);
  }

  const totalsByUnit = Object.values(totalsMap)
    .map(t => ({ ...t, fechas: t.fechas.sort() }))
    .sort((a, b) => String(a.unidad).localeCompare(String(b.unidad)));

  const detailSheetData = allRows.map(r => ({
    Fecha: r.date || r.fecha || '',
    Turno: (r.turno || r.shift) === 'dia' ? 'Día' : 'Noche',
    Unidad: r.unidad || r.unit || '',
    Piso: r.piso || '',
    Dto: r.dto || '',
    Propietario: r.propietario || '',
    'Reservado por': `${r.nombre || r.name || ''} ${r.apellido || r.surname || ''}`.trim(),
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
  return { buffer, filename, rows: allRows, totalsByUnit };
}

module.exports = { buildMonthlyReport };
