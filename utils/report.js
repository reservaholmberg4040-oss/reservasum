const XLSX = require('xlsx');
const db = require('../db');

/**
 * Genera un informe mensual de reservas para facturar a las unidades.
 * @param {string} period - "YYYY-MM"
 */
function buildMonthlyReport(period) {
  const rows = db.reservations.byPeriod(period);

  // Totales por unidad (para cobrar expensas)
  const totalsMap = {};
  for (const r of rows) {
    const key = r.unidad;
    if (!totalsMap[key]) {
      totalsMap[key] = { unidad: r.unidad, piso: r.piso, dto: r.dto, propietario: r.propietario, turnos_dia: 0, turnos_noche: 0, total_turnos: 0, fechas: [] };
    }
    if (r.turno === 'dia') totalsMap[key].turnos_dia++;
    else totalsMap[key].turnos_noche++;
    totalsMap[key].total_turnos++;
    totalsMap[key].fechas.push(`${r.date} (${r.turno === 'dia' ? 'Día' : 'Noche'})`);
  }
  const totalsByUnit = Object.values(totalsMap)
    .map(t => ({ ...t, fechas: t.fechas.sort() }))
    .sort((a, b) => a.unidad.localeCompare(b.unidad));

  const detailSheetData = rows.map(r => ({
    Fecha: r.date,
    Turno: r.turno === 'dia' ? 'Día' : 'Noche',
    Unidad: r.unidad,
    Piso: r.piso,
    Dto: r.dto,
    Propietario: r.propietario,
    'Reservado por': `${r.nombre} ${r.apellido}`,
    'Fecha de reserva': r.created_at
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

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  const wsDetail = XLSX.utils.json_to_sheet(detailSheetData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen por Unidad');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle de Reservas');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `informe-reservas-SUM-Holmberg4040-${period}.xlsx`;

  return { buffer, filename, rows, totalsByUnit };
}

module.exports = { buildMonthlyReport };
