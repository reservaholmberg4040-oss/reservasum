const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Genera el informe mensual leyendo directamente del archivo JSON de reservas correcto.
 * @param {string} period - El período a consultar en formato YYYY-MM (ej: "2026-09")
 */
function buildMonthlyReport(period) {
  let allRows = [];
  
  try {
    // 1. Leemos directamente desde reservations.json que es donde se guardan las reservas
    const reservationsFilePath = path.join(__dirname, '../data/reservations.json');
    
    if (fs.existsSync(reservationsFilePath)) {
      const fileContent = fs.readFileSync(reservationsFilePath, 'utf8');
      const parsedData = JSON.parse(fileContent);
      
      // Normalizamos a un array plano
      if (Array.isArray(parsedData)) {
        allRows = parsedData;
      } else if (parsedData && typeof parsedData === 'object') {
        allRows = Object.values(parsedData);
      }
    } else {
      console.warn('[REPORT] No se encontró el archivo reservations.json en:', reservationsFilePath);
    }

    console.log(`[REPORT DEBUG] Total de reservas totales en la base de datos:`, allRows.length);
    console.log(`[REPORT DEBUG] Período solicitado para el reporte:`, period);

    // 2. Filtramos estrictamente por el período (YYYY-MM)
    allRows = allRows.filter(r => {
      if (!r || typeof r !== 'object') return false;
      
      const fechaReserva = String(r.date || r.fecha || r.day || '');
      return fechaReserva.startsWith(period) || fechaReserva.includes(period);
    });

    console.log(`[REPORT DEBUG] Reservas filtradas coincidentes con ${period}:`, allRows.length);

  } catch (e) {
    console.error('Error crítico al leer las reservas para el reporte:', e);
    allRows = [];
  }

  // 3. Procesamos los totales por unidad
  const totalsMap = {};
  for (const r of allRows) {
    const unidadKey = r.unit_id || r.unidad || r.unit || 'S/N';
    
    if (!totalsMap[unidadKey]) {
      totalsMap[unidadKey] = { 
        unidad: unidadKey, 
        piso: r.piso || '', 
        dto: r.dto || '', 
        propietario: r.propietario || 'Sin Propietario', 
        turnos_dia: 0, 
        turnos_noche: 0, 
        total_turnos: 0, 
        fechas: [] 
      };
    }
    
    const turnoStr = String(r.turno || r.shift || '').toLowerCase();
    if (turnoStr.includes('dia') || turnoStr.includes('día') || turnoStr === 'd') {
      totalsMap[unidadKey].turnos_dia++;
    } else {
      totalsMap[unidadKey].turnos_noche++;
    }
    totalsMap[unidadKey].total_turnos++;
    
    const fechaStr = r.date || r.fecha || '';
    totalsMap[unidadKey].fechas.push(`${fechaStr} (${turnoStr.includes('dia') || turnoStr.includes('día') ? 'Día' : 'Noche'})`);
  }

  const totalsByUnit = Object.values(totalsMap)
    .map(t => ({ ...t, fechas: t.fechas.sort() }))
    .sort((a, b) => String(a.unidad).localeCompare(String(b.unidad)));

  // 4. Armamos los datos para la pestaña de Detalle
  const detailSheetData = allRows.map(r => {
    const fechaStr = r.date || r.fecha || '';
    const turnoClean = String(r.turno || '').toLowerCase().includes('dia') || String(r.turno || '').includes('día') ? 'Día' : 'Noche';
    const nombreUsuario = `${r.nombre || ''} ${r.apellido || ''}`.trim();

    return {
      Fecha: fechaStr,
      Turno: turnoClean,
      Unidad: r.unit_id || r.unidad || '',
      Piso: r.piso || '',
      Dto: r.dto || '',
      Propietario: r.propietario || '',
      'Reservado por': nombreUsuario || 'Anónimo',
      'Fecha de creación': r.createdAt || r.created_at || ''
    };
  });

  // 5. Armamos los datos para la pestaña de Resumen
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
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData.length > 0 ? summarySheetData : [{ Mensaje: 'Sin datos registrados para el período seleccionado.' }]);
    const wsDetail = XLSX.utils.json_to_sheet(detailSheetData.length > 0 ? detailSheetData : [{ Mensaje: 'Sin datos registrados para el período seleccionado.' }]);
    
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen por Unidad');
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle de Reservas');
    
    buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (e) {
    console.error('Error generando el archivo Excel:', e);
  }

  const filename = `informe-reservas-SUM-Holmberg4040-${period}.xlsx`;
  return { buffer, filename, rows: allRows, totalsByUnit };
}

module.exports = { buildMonthlyReport };
