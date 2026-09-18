const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const xlsx = require('xlsx');
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
  const adminUser = db.admin.byUsername(username);
  if (!adminUser || !bcrypt.compareSync(password || '', adminUser.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  req.session.isAdmin = true;
  req.session.username = adminUser.username;
  res.json({ ok: true, username: adminUser.username });
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
  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const { totalsByUnit, rows } = buildMonthlyReport(period);

  res.json({
    period,
    totalReservasMes: rows.length,
    unidadesActivas: totalsByUnit.length,
    totalsByUnit,
    periodosDisponibles: db.reservations.distinctPeriods()
  });
});

router.get('/report.xlsx', requireAdmin, (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const { buffer, filename } = buildMonthlyReport(period);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.post('/send-report', requireAdmin, async (req, res) => {
  const period = req.body.period || previousMonthPeriod();
  const recipient = req.body.recipient;
  try {
    await sendMonthlyReport(period, recipient);
    res.json({ ok: true, period });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/report-log', requireAdmin, (req, res) => {
  res.json(db.reportLog.all());
});

// --- Gestión de Unidades ---
router.get('/units', requireAdmin, (req, res) => {
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

// --- IMPORTAR EXCEL CON FORMATO COMPATIBLE CON RESERVAS ---
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
        dto: String(row['Depto'] || row['dto'] || row['DTO'] || 'A'),
        propietario: String(row['Propietario'] || row['propietario'] || 'SIN NOMBRE'),
        pin: String(row['PIN'] || row['pin'] || Math.floor(1000 + Math.random() * 9000))
      };
    });

    const replaceAll = req.query.replace === 'true';
    let currentUnits = replaceAll ? [] : db.units.all();

    const mergedUnits = [...currentUnits, ...importedUnits];
    db.units.saveAll(mergedUnits);

    res.json({ success: true, message: `Se importaron ${importedUnits.length} unidades correctamente.` });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la planilla Excel.' });
  }
});

router.post('/units/add', requireAdmin, (req, res) => {
  try {
    const { unidad, piso, dto, propietario, pin } = req.body;
    const currentUnits = db.units.all();
    const uVal = String(unidad || `00${currentUnits.length + 1}`).padStart(4, '0');

    const newUnit = {
      id: uVal,
      unidad: uVal,
      piso: piso || 'PB',
      dto: dto || 'A',
      propietario: propietario || '',
      pin: pin && /^\d{4}$/.test(pin) ? pin : Math.floor(1000 + Math.random() * 9000).toString()
    };

    currentUnits.push(newUnit);
    db.units.saveAll(currentUnits);
    res.json({ success: true, unit: newUnit });
  } catch (err) {
    res.status(500).json({ error: 'Error al agregar la unidad.' });
  }
});

router.delete('/units/delete', requireAdmin, (req, res) => {
  try {
    const { ids, deleteAll } = req.body;
    if (deleteAll) {
      db.units.saveAll([]);
      return res.json({ success: true, message: 'Todas las unidades han sido eliminadas.' });
    }

    const currentUnits = db.units.all();
    const filteredUnits = currentUnits.filter(u => !ids.includes(String(u.unidad)) && !ids.includes(String(u.id)));
    db.units.saveAll(filteredUnits);
    res.json({ success: true, message: 'Unidades eliminadas.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar unidades.' });
  }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
