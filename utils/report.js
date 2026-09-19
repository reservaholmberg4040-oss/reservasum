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

    // 2. Aseguramos que rawAll sea un arreglo plano
    if (!Array.isArray(rawAll)) {
      if (typeof rawAll === 'object' && rawAll !== null) {
        // Si es un objeto {0: {...}, 1: {...}}, lo convertimos a array
        rawAll = Object.values(rawAll);
      } else {
        rawAll = [];
      }
    }

    // 3. Filtramos manualmente por el período (YYYY-MM) de forma flexible
    allRows = rawAll.filter(r => {
      if (!r || typeof r !== 'object') return false;
      
      // Buscamos en todas las propiedades posibles donde la fecha pueda estar guardada
      // 'fecha' es para compatibilidad con datos ingresados manualmente o en español
      const possibleDateKeys = ['date', 'fecha', 'day', 'created_at', 'start_time', 'startTime', 'start'];
      let fechaEncontrada = null;

      for (const key of possibleDateKeys) {
        if (r[key]) {
          fechaEncontrada = String(r[key]);
          break;
        }
      }

      // Si encontramos una propiedad con fecha, verificamos si coincide con el período
      if (fechaEncontrada) {
        // Asumimos formato YYYY-MM-DD o similar que contenga "YYYY-MM"
        return fechaEncontrada.includes(period);
      }
      
      return false; // Si no tiene fecha, no entra en el informe
    });

  } catch (e) {
    console.error('Error crítico al obtener reservas para el reporte:', e);
    allRows = [];
  }

  const totalsMap = {};
  for (const r of allRows) {
    // Identificamos la unidad de forma segura
    const key = r.unidad || r.unit || r.piso_depto || 'S/N';
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
    
    // Identificamos el turno de forma flexible
    const turnoStr = String(r.turno || r.shift || '').toLowerCase();
    if (turnoStr.includes('dia') || turnoStr.includes('día') || turnoStr === 'd') {
      totalsMap[key].turnos_dia++;
    } else {
      totalsMap[key].turnos_noche++;
    }
    totalsMap[key].total_turnos++;
    
    // Obtenemos la fecha para el resumen, buscando en los mismos campos posibles
    let fechaRes = '';
    const possibleDateKeys = ['date', 'fecha', 'day', 'created_at', 'start_time', 'startTime', 'start'];
    for (const key of possibleDateKeys) { if(r[key]) { fechaRes = r[key]; break; } }

    totalsMap[key].fechas.push(`${fechaRes} (${turnoStr.includes('dia') || turnoStr.includes('día') ? 'Día' : 'Noche'})`);
  }

  const totalsByUnit = Object.values(totalsMap)
    .map(t => ({ ...t, fechas: t.fechas.sort() }))
    .sort((a, b) => String(a.unidad).localeCompare(String(b.unidad)));

  // Datos para la pestaña Detalle de Reservas
  const detailSheetData = allRows.map(r => {
    // Obtener la fecha y el nombre de usuario de forma segura
    let fechaStr = '';
    const possibleDateKeys = ['date', 'fecha', 'day', 'created_at', 'start_time', 'startTime', 'start'];
    for (const key of possibleDateKeys) { if(r[key]) { fechaStr = r[key]; break; } }
    
    const nombreUsuario = r.nombre || r.name || r.usuario || '';
    const apellidoUsuario = r.apellido || r.surname || '';
    const usuarioStr = `${nombreUsuario} ${apellidoUsuario}`.trim();

    return {
      Fecha: fechaStr,
      Turno: String(r.turno || r.shift || '').toLowerCase().includes('dia') || String(r.turno || '').includes('día') ? 'Día' : 'Noche',
      Unidad: r.unidad || r.unit || '',
      Piso: r.piso || '',
      Dto: r.dto || '',
      Propietario: r.propietario || '',
      'Reservado por': usuarioStr,
      'Detalles de reserva': r.detalle || r.reservo || '',
      'Fecha de creación': r.created_at || ''
    };
  });

  // Datos para la pestaña Resumen por Unidad
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
    // Generamos el archivo como un buffer para enviarlo directamente
    buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (e) {
    console.error('Error generando Excel:', e);
  }

  const filename = `informe-reservas-SUM-Holmberg4040-${period}.xlsx`;
  // Retornamos el buffer y el nombre, además de las filas para depurar si es necesario
  return { buffer, filename, rows: allRows, totalsByUnit };
}

module.exports = { buildMonthlyReport };
