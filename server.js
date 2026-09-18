const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

// Configuración esencial para Render (proxy inverso)
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// Importar rutas
const adminRoutes = require('./routes/admin');
const unitsRoutes = require('./routes/units');
const reservationsRoutes = require('./routes/reservations');

app.use('/api/admin', adminRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/reservations', reservationsRoutes);

// Protección de la vista de administración
app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html')); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
