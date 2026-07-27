const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { buildMonthlyReport } = require('../utils/report');
const { sendMonthlyReport, previousMonthPeriod } = require('../utils/mailer');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autenticado.' });
}

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

// --- Dashboard: estadísticas por unidad y mes (para cobrar expensas) ---
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

// --- Descargar informe Excel de un mes ---
router.get('/report.xlsx', requireAdmin, (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const { buffer, filename } = buildMonthlyReport(period);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// --- Enviar manualmente el informe por mail (además del cron automático) ---
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

// --- Historial de envíos de mail ---
router.get('/report-log', requireAdmin, (req, res) => {
  res.json(db.reportLog.all());
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
