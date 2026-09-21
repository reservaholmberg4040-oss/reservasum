const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const db = require('../db'); 
const { buildMonthlyReport } = require('../utils/report'); 
const { sendMonthlyReport, previousMonthPeriod } = require('../utils/mailer');

const upload = multer({ storage: multer.memoryStorage() });

const blockedDaysFile = path.join(__dirname, '../data/blocked-days.json');
const reservationsFile = path.join(__dirname, '../data/reservations.json');

function readBlockedDays() {
  try {
    if (!fs.existsSync(blockedDaysFile)) return [];
    const data = fs.readFileSync(blockedDaysFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error leyendo blocked-days.json:', err);
    return [];
  }
}

function writeBlockedDays(data) {
  try {
    const dir = path.dirname(blockedDaysFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(blockedDaysFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo blocked-days.json:', err);
    throw err;
  }
}

function readReservations() {
  try {
    if (!fs.existsSync(reservationsFile)) return [];
    const data = fs.readFileSync(reservationsFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autenticado.' });
}

// --- Endpoint para obtener las reservas del mes para el Calendario del Admin ---
router.get('/calendar-data', requireAdmin, (req, res) => {
  try {
    const { year, month } = req.query;
    const reservations = readReservations();
    const blockedDays = readBlockedDays();

    let filteredReservations = reservations;
    if (year && month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      filteredReservations = reservations.filter(r => r && r.date && String(r.date).startsWith(prefix));
    }

    res.json({
      success: true,
      reservations: filteredReservations,
      blockedDays: blockedDays
    });
  } catch (err) {
    console.error('Error al obtener datos del calendario admin:', err);
    res.status(500).json({ error: 'Error interno al cargar los datos del calendario.' });
  }
});

// --- Endpoints de Logs de Auditoría con Filtros de Fecha Blindados ---
router.get('/audit-logs', requireAdmin, (req, res) => {
  try {
    let { startDate, endDate } = req.query;
    let logs = db.auditLogs.all();

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !dateRegex.test(startDate)) startDate = null;
    if (endDate && !dateRegex.test(endDate)) endDate = null;

    if (startDate) {
      logs = logs.filter(l => l.timestamp.slice(0, 10) >= startDate);
    }
    if (endDate) {
      logs = logs.filter(l => l.timestamp.slice(0, 10) <= endDate);
    }

    res.json({ success: true, logs });
  } catch (err) {
    console.error('Error al obtener logs:', err);
    res.status(500).json({ error: 'Error interno al obtener los logs.' });
  }
});

router.get('/audit-logs/download', requireAdmin, (req, res) => {
  try {
    let { startDate, endDate } = req.query;
    let logs = db.auditLogs.all();

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !dateRegex.test(startDate)) startDate = null;
    if (endDate && !dateRegex.test(endDate)) endDate = null;

    if (startDate) {
      logs = logs.filter(l => l.timestamp.slice(0, 10) >= startDate);
    }
    if (endDate) {
      logs = logs.filter(l => l.timestamp.slice(0, 10) <= endDate);
    }

    const rows = logs.map(l => ({
      'Fecha / Hora': l.timestamp,
      'Usuario / Actor': l.user,
      'Acción': l.action,
      'Detalle': l.details
    }));

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Auditoria');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Auditoria_SUM_${new Date().toISOString().slice(0,10)}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error al descargar excel de logs:', err);
    res.status(500).json({ error: 'Error al generar la descarga de logs.' });
  }
});
// -------------------------------------------------------------------

// --- Endpoints para Días Bloqueados con Validación de Reservas ---
router.get('/blocked-days', requireAdmin, (req, res) => {
  res.json(readBlockedDays());
});

router.post('/blocked-days', requireAdmin, (req, res) => {
  const { date, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'La fecha es obligatoria.' });

  const reservations = readReservations();
  const existingRes = reservations.filter(r => r && String(r.date).trim() === String(date).trim());

  if (existingRes.length > 0) {
    const detalles = existingRes.map(r => `Turno ${r.turno} (Unidad ${r.unit_id})`).join(', ');
    return res.status(400).json({ 
      error: `No se puede bloquear el día ${date} porque tiene reservas activas: ${detalles}.` 
    });
  }

  let blocked = readBlockedDays();
  blocked = blocked.filter(b => b.date !== date);
  const motivo = reason ? String(reason).trim() : 'Mantenimiento del SUM';
  blocked.push({ date, reason: motivo });
  writeBlockedDays(blocked);

  db.auditLogs.add('BLOQUEAR_DIA', `Se bloqueó el día ${date}. Motivo: ${motivo}`, req.session.username || 'Admin');

  res.json({ success: true, message: 'Día bloqueado correctamente.' });
});

router.delete('/blocked-days/:date', requireAdmin, (req, res) => {
  const { date } = req.params;
  let blocked = readBlockedDays();
  blocked = blocked.filter(b => b.date !== date);
  writeBlockedDays(blocked);

  db.auditLogs.add('DESBLOQUEAR_DIA', `Se removió el bloqueo del día ${date}`, req.session.username || 'Admin');

  res.json({ success: true, message: 'Bloqueo removido.' });
});
// -------------------------------------------------------------------

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const envUser = process.env.ADMIN_USER || 'admin';
  const envPass = process.env.ADMIN_PASSWORD || 'Holmberg4040';

  if (username === envUser && password === envPass) {
    req.session.isAdmin = true;
    req.session.username = envUser;
    db.auditLogs.add('LOGIN_ADMIN', `Inicio de sesión exitoso`, envUser);
    return res.json({ ok: true, username: envUser });
  }

  const adminUser = db.admin.byUsername(username);
  if (adminUser && bcrypt.compareSync(password || '', adminUser.password_hash)) {
    req.session.isAdmin = true;
    req.session.username = adminUser.username;
    db.auditLogs.add('LOGIN_ADMIN', `Inicio de sesión exitoso`, adminUser.username);
    return res.json({ ok: true, username: adminUser.username });
  }

  return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ isAdmin: true, username: req.session.username });
  }
  res.json({ isAdmin: false });
});

router.get('/dashboard', requireAdmin, (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    const reportResult = buildMonthlyReport(period) || {};
    const totalsByUnit = reportResult.totalsByUnit || [];
    const rows = reportResult.rows || [];

    let resPeriods = [];
    if (db.reservations && typeof db.reservations.distinctPeriods === 'function') {
      resPeriods = db.reservations.distinctPeriods();
    }

    res.json({
      period,
      totalReservasMes: rows.length,
      unidadesActivas: totalsByUnit.length,
      totalsByUnit: totalsByUnit,
      periodosDisponibles: resPeriods.length > 0 ? resPeriods : [period]
    });
  } catch (err) {
    console.error('Error en /dashboard:', err);
    res.status(500).json({ error: 'Error interno al generar el reporte: ' + err.message });
  }
});

router.get('/download-report', requireAdmin, (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    const report = buildMonthlyReport(period);

    if (!report || !report.buffer) {
      return res.status(404).json({ error: 'No se pudo generar el reporte para este período.' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    return res.send(report.buffer);
  } catch (err) {
    console.error('Error al descargar el reporte:', err);
    res.status(500).json({ error: 'Error interno al generar la descarga.' });
  }
});

router.get('/report-log', requireAdmin, (req, res) => {
  const logs = (db.reportLog && typeof db.reportLog.all === 'function') ? db.reportLog.all() : [];
  res.json(logs);
});

router.get('/units', requireAdmin, (req, res) => {
  const units = (db.units && typeof db.units.all === 'function') ? db.units.all() : [];
  res.json(units);
});

router.put('/units/:id/pin', requireAdmin, (req, res) => {
  const { pin } = req.body;
  if (!/^\d{4}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'El PIN debe ser de 4 dígitos numéricos.' });
  }
  const unit = (db.units && typeof db.units.setPin === 'function') ? db.units.setPin(req.params.id, pin) : null;
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(unit);
});

router.post('/units/:id/regenerate-pin', requireAdmin, (req, res) => {
  const unit = (db.units && typeof db.units.regeneratePin === 'function') ? db.units.regeneratePin(req.params.id) : null;
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(unit);
});

router.put('/units/:id/propietario', requireAdmin, (req, res) => {
  const { propietario } = req.body;
  if (!propietario || !propietario.trim()) {
    return res.status(400).json({ error: 'El propietario no puede quedar vacío.' });
  }
  const unit = (db.units && typeof db.units.setPropietario === 'function') ? db.units.setPropietario(req.params.id, propietario) : null;
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(unit);
});

router.put('/units/:id/email', requireAdmin, (req, res) => {
  const { email } = req.body;
  const unit = (db.units && typeof db.units.setEmail === 'function') ? db.units.setEmail(req.params.id, email) : null;
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json({ success: true, unit });
});

router.put('/units/:id/baja', requireAdmin, (req, res) => {
  const { baja } = req.body;
  if (typeof baja !== 'boolean') {
    return res.status(400).json({ error: 'El estado de baja debe ser un valor booleano.' });
  }
  const unit = (db.units && typeof db.units.setBaja === 'function') ? db.units.setBaja(req.params.id, baja) : null;
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json({ success: true, unit });
});

router.post('/units/add', requireAdmin, (req, res) => {
  try {
    const { unidad, piso, depto, propietario, email, pin } = req.body;
    if (!unidad) return res.status(400).json({ error: 'El número de unidad es obligatorio.' });

    const uVal = String(unidad).padStart(4, '0');
    const currentUnits = (db.units && typeof db.units.all === 'function') ? db.units.all() : [];

    if (currentUnits.some(u => String(u.unidad) === uVal || String(u.id) === uVal)) {
      return res.status(400).json({ error: `La unidad ${uVal} ya existe.` });
    }

    const newUnit = {
      id: uVal,
      unidad: uVal,
      piso: String(piso || ''),
      depto: String(depto || ''),
      dto: String(depto || ''),
      propietario: String(propietario || ''),
      email: String(email || '').trim(),
      pin: pin && /^\d{4}$/.test(String(pin)) ? String(pin) : Math.floor(1000 + Math.random() * 9000).toString(),
      baja: false
    };

    currentUnits.push(newUnit);
    if (db.units && typeof db.units.saveAll === 'function') {
        db.units.saveAll(currentUnits);
    }
    
    db.auditLogs.add('ALTA_UNIDAD', `Se agregó la unidad ${uVal} (${propietario})`, req.session.username || 'Admin');

    res.json({ success: true, unit: newUnit });
  } catch (err) {
    res.status(500).json({ error: 'Error al intentar guardar la unidad.' });
  }
});

// Importación robusta para detectar cualquier nombre de columna en el Excel (Depto, Dto, Departamento, etc.)
router.post('/units/import-excel', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo Excel.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const importedUnits = rows.map((row, index) => {
      const cleanRow = {};
      Object.keys(row).forEach(k => {
        cleanRow[k.trim().toLowerCase()] = row[k];
      });

      const rawUnidad = cleanRow['unidad'] || cleanRow['id'] || `00${index + 1}`;
      const uVal = String(rawUnidad).padStart(4, '0');
      
      const pisoVal = String(cleanRow['piso'] || cleanRow['piso/dto'] || cleanRow['piso/depto'] || '');
      const deptoVal = String(cleanRow['depto'] || cleanRow['dto'] || cleanRow['departamento'] || '');

      return {
        id: uVal,
        unidad: uVal,
        piso: pisoVal,
        depto: deptoVal,
        dto: deptoVal,
        propietario: String(cleanRow['propietario'] || cleanRow['nombre'] || 'SIN NOMBRE'),
        email: String(cleanRow['email'] || cleanRow['correo'] || '').trim(),
        pin: String(cleanRow['pin'] || Math.floor(1000 + Math.random() * 9000)),
        baja: false
      };
    });

    const replaceAll = req.query.replace === 'true';
    let currentUnits = [];
    if (!replaceAll && db.units && typeof db.units.all === 'function') {
        currentUnits = db.units.all();
    }
    
    const mergedUnits = [...(Array.isArray(currentUnits) ? currentUnits : []), ...importedUnits];
    if (db.units && typeof db.units.saveAll === 'function') {
      db.units.saveAll(mergedUnits);
    }

    db.auditLogs.add('IMPORTAR_EXCEL_UNIDADES', `Se importaron ${importedUnits.length} unidades desde Excel (Reemplazar: ${replaceAll})`, req.session.username || 'Admin');

    res.json({ success: true, message: `Se importaron ${importedUnits.length} unidades correctamente.` });
  } catch (err) {
    console.error('Error al procesar la planilla Excel:', err);
    res.status(500).json({ error: 'Error al procesar la planilla Excel.' });
  }
});

router.delete('/units/delete', requireAdmin, (req, res) => {
  try {
    const { ids, deleteAll } = req.body;
    if (deleteAll) {
      if (db.units && typeof db.units.saveAll === 'function') {
        db.units.saveAll([]);
      }
      db.auditLogs.add('ELIMINAR_TODAS_UNIDADES', `Se eliminaron todas las unidades de la base de datos`, req.session.username || 'Admin');
      return res.json({ success: true, message: 'Todas las unidades han sido eliminadas.' });
    }

    const currentUnits = (db.units && typeof db.units.all === 'function') ? db.units.all() : [];
    const filteredUnits = Array.isArray(currentUnits) ? currentUnits.filter(u => !ids.includes(String(u.unidad)) && !ids.includes(String(u.id))) : [];

    if (db.units && typeof db.units.saveAll === 'function') {
      db.units.saveAll(filteredUnits);
    }

    db.auditLogs.add('ELIMINAR_UNIDADES', `Se eliminaron las unidades: ${ids.join(', ')}`, req.session.username || 'Admin');

    res.json({ success: true, message: 'Unidades eliminadas.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar unidades.' });
  }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
