const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

// Configuración esencial para Render (proxy inverso)
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de la sesión de usuario/admin
app.use(session({
  secret: process.env.SESSION_SECRET || 'sum_holmberg_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 día
  }
}));

// Protección estricta para que nadie entre al panel sin sesión
app.use(['/admin', '/admin.html'], (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/login.html');
});

// Archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Importar y registrar las rutas de la API
const adminRoutes = require('./routes/admin');
const unitsRoutes = require('./routes/units');
const reservationsRoutes = require('./routes/reservations');

app.use('/api/admin', adminRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/reservations', reservationsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
