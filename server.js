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

// Configuración esencial para que Render reconozca el proxy seguro (HTTPS)
app.set('trust proxy', 1);

app.use(express.json());

// Configuración de cookie-session original del proyecto + seguridad para producción
app.use(cookieSession({
  name: 'sum_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-cambiar'],
  maxAge: 12 * 60 * 60 * 1000, // 12 horas
  secure: process.env.NODE_ENV === 'production', // Activa HTTPS seguro en Render
  sameSite: 'lax'
}));

// 1. PROTECCIÓN ESTRICTA: Bloquea /admin y /admin.html si no hay sesión de administrador activa
app.use(['/admin', '/admin.html'], (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/login.html');
});

// 2. Archivos estáticos públicos (se cargan DESPUÉS de proteger /admin)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ buildingName: process.env.BUILDING_NAME || 'Holmberg 4040' });
});

// Rutas de la API
app.use('/api/reservations', reservationsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/admin', adminRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor SUM Holmberg 4040 corriendo en http://localhost:${PORT}`);
  scheduleMonthlyReport();
});
