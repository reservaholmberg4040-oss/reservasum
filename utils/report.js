const XLSX = require('xlsx');
const db = require('../db');

/**
 * Genera un informe mensual normalizando inteligentemente cualquier formato de período.
 * @param {string} period
 */
function buildMonthlyReport(period) {
  let targetYear = '';
  let targetMonth = '';

  // Normalizamos el período ingresado (soporta "9-2026", "2026-09", "09/2026", etc.)
  if (period) {
    const cleanStr = String(period).trim();
    const parts = cleanStr.split(/[-/]/);
    if (parts.length === 2) {
      if (parts[0].length === 4) {
        targetYear = parts[0];
        targetMonth = parts[1].padStart(2, '0');
      } else if (parts[1].length === 4) {
        targetYear = parts[1];
        targetMonth = parts[0].padStart(2, '0');
      }
    }
  }

  // Si no se pudo interpretar, usamos el mes y año actual por defecto
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

  const finalYear = targetYear || currentYear;
  const finalMonth = targetMonth || currentMonth;
  const normalizedPeriod = `${finalYear}-${finalMonth}`;

  let allRows = [];
  try {
    let rawAll = [];
    if (db.reservations && typeof db.reservations.all === 'function') {
      rawAll = db.reservations.all();
    } else if (db.reservations && typeof db.reservations.byPeriod === 'function') {
      rawAll = db.reservations.byPeriod(normalizedPeriod);
    }

    if (!Array.isArray(rawAll) && rawAll) {
      rawAll = Object.values(rawAll);
    }

    // Filtramos flexiblemente buscando coincidencia del año y mes
    allRows = (Array.isArray(rawAll) ? rawAll : []).filter(r => {
      if (!r) return false;
      const fechaStr = String(r.date || r.fecha || r.day || r.created_at || '');
      return fechaStr.includes(`${finalYear}-${finalMonth}`) || 
             fechaStr.includes(`${finalMonth}/${finalYear}`) ||
             fechaStr.startsWith(normalizedPeriod);
    });

  } catch (e) {
    console.error('Error al obtener reservas para el reporte:', e);
    allRows = [];
  }

  const totalsMap = {};
  for (const r of allRows) {
    const key = r.unidad || r.unit || r.piso || 'S/N';
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
    const turno = String(r.turno || r.shift || '').toLowerCase();
    if (turno.includes('dia') || turno === 'd') {
      totalsMap[key].turnos_dia++;
    } else {
      totalsMap[key].turnos_noche++;
    }
    totalsMap[key].total_turnos++;
    
    const fechaRes = r.date || r.fecha || '';
    totalsMap[key].fechas.push(`${fechaRes} (${turno.includes('dia') ? 'Día' : 'Noche'})`);
  }

  const totalsByUnit = Object.values(totalsMap)
    .map(t => ({ ...t, fechas: t.fechas.sort() }))
    .sort((a, b) => String(a.unidad).localeCompare(String(b.unidad)));

  const detailSheetData = allRows.map(r => ({
    Fecha: r.date || r.fecha || '',
    Turno: String(r.turno || '').toLowerCase().includes('dia') ? 'Día' : 'Noche',
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

  const filename = `informe-reservas-SUM-Holmberg4040-${normalizedPeriod}.xlsx`;
  return { buffer, filename, rows: allRows, totalsByUnit };
}

module.exports = { buildMonthlyReport };
