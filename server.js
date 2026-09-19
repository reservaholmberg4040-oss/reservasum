@@ -1,44 +1,44 @@
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();
const cookieSession = require('cookie-session');
// Configuración esencial para Render (proxy inverso)
app.set('trust proxy', 1);
const db = require('./db'); // inicializa y siembra la base de datos
const unitsRouter = require('./routes/units');
const reservationsRouter = require('./routes/reservations');
const adminRouter = require('./routes/admin');
const { scheduleMonthlyReport } = require('./utils/mailer');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({
  secret: process.env.SESSION_SECRET || 'sum_holmberg_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 día
  }
app.use(express.json());
app.use(cookieSession({
  name: 'sum_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-cambiar'],
  maxAge: 12 * 60 * 60 * 1000 // 12 horas
}));

// Importar rutas
const adminRoutes = require('./routes/admin');
const unitsRoutes = require('./routes/units');
const reservationsRoutes = require('./routes/reservations');
// Para que las rutas de reservas puedan usar req.session.isAdmin al editar/borrar
app.use('/api/reservations', reservationsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/admin', adminRouter);

app.use('/api/admin', adminRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.get('/api/config', (req, res) => {
  res.json({ buildingName: process.env.BUILDING_NAME || 'Holmberg 4040' });
});

app.use(express.static(path.join(__dirname, 'public')));

// Protección de la vista de administración
app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html')); 
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Servidor SUM Holmberg 4040 corriendo en http://localhost:${PORT}`);
  scheduleMonthlyReport();
});
