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

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autenticado.' });
}

// --- Endpoints para Días Bloqueados ---
router.get('/blocked-days', requireAdmin, (req, res) => {
  res.json(readBlockedDays());
});

router.post('/blocked-days', requireAdmin, (req, res) => {
  const { date, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'La fecha es obligatoria.' });

  let blocked = readBlockedDays();
  blocked = blocked.filter(b => b.date !== date);
  blocked.push({ date, reason: reason ? String(reason).trim() : 'Mantenimiento del SUM' });
  writeBlockedDays(blocked);

  res.json({ success: true, message: 'Día bloqueado correctamente.' });
});

router.delete('/blocked-days/:date', requireAdmin, (req, res) => {
  const { date } = req.params;
  let blocked = readBlockedDays();
  blocked = blocked.filter(b => b.date !== date);
  writeBlockedDays(blocked);

  res.json({ success: true, message: 'Bloqueo removido.' });
});
// -------------------------------------

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const envUser = process.env.ADMIN_USER || 'admin';
  const envPass = process.env.ADMIN_PASSWORD || 'Holmberg4040';

  if (username === envUser && password === envPass) {
    req.session.isAdmin = true;
    req.session.username = envUser;
    return res.json({ ok: true, username: envUser });
  }

  const adminUser = db.admin.byUsername(username);
  if (adminUser && bcrypt.compareSync(password || '', adminUser.password_hash)) {
    req.session.isAdmin = true;
    req.session.username = adminUser.username;
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
    
    if (typeof buildMonthlyReport !== 'function') {
      throw new Error('Módulo de reportes no disponible.');
    }

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
    return res.status(400).json({ error: 'El estado de baja debe ser un valor booleano (true/false).' });
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
      propietario: String(propietario || ''),
      email: String(email || '').trim(),
      pin: pin && /^\d{4}$/.test(String(pin)) ? String(pin) : Math.floor(1000 + Math.random() * 9000).toString(),
      baja: false
    };

    currentUnits.push(newUnit);
    if (db.units && typeof db.units.saveAll === 'function') {
        db.units.saveAll(currentUnits);
    }
    
    res.json({ success: true, unit: newUnit });
  } catch (err) {
    console.error('Error al agregar unidad:', err);
    res.status(500).json({ error: 'Error al intentar guardar la unidad.' });
  }
});

router.post('/units/import-excel', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo Excel.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const importedUnits = rows.map((row, index) => {
      const uVal = String(row['Unidad'] || row['unidad'] || `00${index + 1}`).padStart(4, '0');
      return {
        id: uVal,
        unidad: uVal,
        piso: String(row['Piso'] || row['piso'] || 'PB'),
        depto: String(row['Depto'] || row['depto'] || row['DTO'] || 'A'),
        propietario: String(row['Propietario'] || row['propietario'] || 'SIN NOMBRE'),
        email: String(row['Email'] || row['email'] || row['Correo'] || row['correo'] || '').trim(),
        pin: String(row['PIN'] || row['pin'] || Math.floor(1000 + Math.random() * 9000)),
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
      return res.json({ success: true, message: 'Todas las unidades han sido eliminadas.' });
    }

    const currentUnits = (db.units && typeof db.units.all === 'function') ? db.units.all() : [];
    const filteredUnits = Array.isArray(currentUnits) ? currentUnits.filter(u => !ids.includes(String(u.unidad)) && !ids.includes(String(u.id))) : [];

    if (db.units && typeof db.units.saveAll === 'function') {
      db.units.saveAll(filteredUnits);
    }

    res.json({ success: true, message: 'Unidades eliminadas.' });
  } catch (err) {
    console.error('Error al eliminar unidades:', err);
    res.status(500).json({ error: 'Error al eliminar unidades.' });
  }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
