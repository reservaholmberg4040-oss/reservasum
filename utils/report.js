const XLSX = require('xlsx');
const db = require('../db');

/**
 * Genera el informe mensual de reservas buscando de forma flexible y robusta.
 * @param {string} period - El período a consultar en formato YYYY-MM (ej: "2026-09")
 */
function buildMonthlyReport(period) {
  let allRows = [];
  try {
    // 1. Intentamos obtener todas las reservas de la base de datos
    let rawAll = [];
    if (db.reservations && typeof db.reservations.all === 'function') {
      rawAll = db.reservations.all();
    }

    // 2. Aseguramos que sea un arreglo plano
    if (!Array.isArray(rawAll)) {
      if (typeof rawAll === 'object' && rawAll !== null) {
        rawAll = Object.values(rawAll); // Convierte objetos tipo {0: {...}, 1: {...}} en array
      } else {
        rawAll = [];
      }
    }

    // 3. Filtramos manualmente por el período (YYYY-MM) de forma flexible
    allRows = rawAll.filter(r => {
      if (!r) return false;
      
      // Buscamos en todas las propiedades posibles donde la fecha pueda estar guardada
      const possibleDateKeys = ['date', 'fecha', 'day', 'created_at', 'start_time', 'startTime'];
      let fechaEncontrada = null;

      for (const key of possibleDateKeys) {
        if (r[key]) {
          fechaEncontrada = String(r[key]);
          break;
        }
      }

      // Si encontramos una fecha, verificamos si pertenece al período
      if (fechaEncontrada) {
        return fechaEncontrada.startsWith(period) || fechaEncontrada.includes(period);
      }
      
      return false; // Si no tiene fecha, no entra en el informe
    });

  } catch (e) {
    console.error('Error crítico al obtener reservas para el reporte:', e);
    allRows = [];
  }

  // El resto de la lógica para armar el Excel permanece igual
  const totalsMap = {};
  for (const r of allRows) {
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
    const turno = String(r.turno || '').toLowerCase();
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

  const detailSheetData = allRows.map(r => {
    // Obtener la fecha y el nombre de usuario de forma segura
    let fechaStr = '';
    const possibleDateKeys = ['date', 'fecha', 'day', 'created_at'];
    for (const key of possibleDateKeys) { if(r[key]) { fechaStr = r[key]; break; } }
    
    const usuarioStr = `${r.nombre || r.name || ''} ${r.apellido || r.surname || ''}`.trim();

    return {
      Fecha: fechaStr,
      Turno: String(r.turno || '').toLowerCase().includes('dia') ? 'Día' : 'Noche',
      Unidad: r.unidad || r.unit || '',
      Piso: r.piso || '',
      Dto: r.dto || '',
      Propietario: r.propietario || '',
      'Reservado por': usuarioStr,
      'Detalles de reserva': r.detalle || r.reservo || ''
    };
  });

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
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData.length > 0 ? summarySheetData : [{ Mensaje: 'Sin datos registrados para el período.' }]);
    const wsDetail = XLSX.utils.json_to_sheet(detailSheetData.length > 0 ? detailSheetData : [{ Mensaje: 'Sin datos registrados para el período.' }]);
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
