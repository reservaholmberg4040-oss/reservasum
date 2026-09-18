require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');

const db = require('./db'); // inicializa y siembra la base de datos
const unitsRouter = require('./routes/units');
const reservationsRouter = require('./routes/reservations');
const adminRouter = require('./routes/admin');
const { scheduleMonthlyReport } = require('./utils/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieSession({
  name: 'sum_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-cambiar'],
  maxAge: 12 * 60 * 60 * 1000 // 12 horas
}));

// Para que las rutas de reservas puedan usar req.session.isAdmin al editar/borrar
app.use('/api/reservations', reservationsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/admin', adminRouter);

app.get('/api/config', (req, res) => {
  res.json({ buildingName: process.env.BUILDING_NAME || 'Holmberg 4040' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor SUM Holmberg 4040 corriendo en http://localhost:${PORT}`);
  scheduleMonthlyReport();
});
