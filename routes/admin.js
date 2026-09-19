const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const xlsx = require('xlsx');
// IMPORTANTE: Usamos una única instancia consistente de db
const db = require('../db'); 
const { buildMonthlyReport } = require('../utils/report'); 
const { sendMonthlyReport, previousMonthPeriod } = require('../utils/mailer');

const upload = multer({ storage: multer.memoryStorage() });

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autenticado.' });
}

// --- Autenticación ---
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // 1. Verificamos contra las variables de entorno
  const envUser = process.env.ADMIN_USER || 'admin';
  const envPass = process.env.ADMIN_PASSWORD || 'Holmberg4040';

  if (username === envUser && password === envPass) {
    req.session.isAdmin = true;
    req.session.username = envUser;
    return res.json({ ok: true, username: envUser });
  }

  // 2. Si no, contra la base de datos (usando db.admin.byUsername)
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

// --- Dashboard & Informes ---
router.get('/dashboard', requireAdmin, (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    
    const reportResult = buildMonthlyReport(period) || {};
    const totalsByUnit = reportResult.totalsByUnit || [];
    const rows = reportResult.rows || [];

    // Obtenemos los periodos disponibles de db
    const resPeriods = db.reservations.distinctPeriods();

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

// --- Descarga de Informe en Excel ---
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
  // Obtenemos el log de db
  res.json(db.reportLog.all());
});

// --- Gestión de Unidades ---
router.get('/units', requireAdmin, (req, res) => {
  // Obtenemos las unidades de db (ya mapeadas con el campo baja)
  res.json(db.units.all());
});

router.put('/units/:id/pin', requireAdmin, (req, res) => {
  const { pin } = req.body;
  if (!/^\d{4}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'El PIN debe ser de 4 dígitos numéricos.' });
  }
  const unit = db.units.setPin(req.params.id, pin);
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(unit);
});

router.post('/units/:id/regenerate-pin', requireAdmin, (req, res) => {
  const unit = db.units.regeneratePin(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(unit);
});

router.put('/units/:id/propietario', requireAdmin, (req, res) => {
  const { propietario } = req.body;
  if (!propietario || !propietario.trim()) {
    return res.status(400).json({ error: 'El propietario no puede quedar vacío.' });
  }
  const unit = db.units.setPropietario(req.params.id, propietario);
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(unit);
});

// --- NUEVA RUTA: Dar de BAJA / ALTA a una unidad ---
router.put('/units/:id/baja', requireAdmin, (req, res) => {
  const { baja } = req.body;
  if (typeof baja !== 'boolean') {
    return res.status(400).json({ error: 'El estado de baja debe ser un booleano.' });
  }
  const unit = db.units.setBaja(req.params.id, baja);
  if (!unit) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json({ success: true, unit });
});

// --- Agregar Unidad Manualmente ---
router.post('/units/add', requireAdmin, (req, res) => {
  try {
    const { unidad, piso, depto, propietario, pin } = req.body;
    if (!unidad) return res.status(400).json({ error: 'El número de unidad es obligatorio.' });

    const uVal = String(unidad).padStart(4, '0');
    const currentUnits = db.units.all();
    if (currentUnits.some(u => String(u.unidad) === uVal || String(u.id) === uVal)) {
      return res.status(400).json({ error: `La unidad ${uVal} ya existe.` });
    }

    const newUnit = {
      id: uVal,
      unidad: uVal,
      piso: String(piso || ''),
      depto: String(depto || ''),
      propietario: String(propietario || ''),
      pin: pin && /^\d{4}$/.test(String(pin)) ? String(pin) : Math.floor(1000 + Math.random() * 9000).toString(),
      baja: false // Nueva unidad inicia activa
    };

    currentUnits.push(newUnit);
    db.units.saveAll(currentUnits);
    res.json({ success: true, unit: newUnit });
  } catch (err) {
    res.status(500).json({ error: 'Error al intentar guardar la unidad.' });
  }
});

// --- Importar Excel ---
router.post('/units/import-excel', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo Excel.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xls
