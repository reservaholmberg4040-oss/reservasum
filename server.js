require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieSession = require('cookie-session');

const db = require('./db');
const unitsRouter = require('./routes/units');
const reservationsRouter = require('./routes/reservations');
const adminRouter = require('./routes/admin');
// Importamos el middleware requireAdmin desde adminRouter
const { requireAdmin } = require('./routes/admin');
const { scheduleMonthlyReport } = require('./utils/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());

app.use(cookieSession({
  name: 'sum_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-cambiar'],
  maxAge: 12 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ buildingName: process.env.BUILDING_NAME || 'Holmberg 4040' });
});

// --- ENDPOINTS DE CONFIGURACIÓN GENERAL (Protegidos con requireAdmin) ---
app.get('/api/admin/config', requireAdmin, async (req, res) => {
  try {
    const configFile = path.join(__dirname, 'data', 'config.json');

    let config = { max_reservas_mes: 1, max_reservas_semana: 1, dias_anticipacion_max: 60, dias_anticipacion_min: 0 };
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }

    res.json({ 
      success: true, 
      config: {
        max_reservas_mes: config.max_reservas_mes ?? 1,
        max_reservas_semana: config.max_reservas_semana ?? 1,
        dias_anticipacion_max: config.dias_anticipacion_max ?? 60,
        dias_anticipacion_min: config.dias_anticipacion_min ?? 0
      } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Error al obtener la configuración' });
  }
});

app.post('/api/admin/config', requireAdmin, async (req, res) => {
  try {
    const { max_reservas_mes, max_reservas_semana, dias_anticipacion_max, dias_anticipacion_min } = req.body;
    
    const dataDir = path.join(__dirname, 'data');
    const configFile = path.join(dataDir, 'config.json');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const configData = {
      max_reservas_mes: Number(max_reservas_mes),
      max_reservas_semana: Number(max_reservas_semana),
      dias_anticipacion_max: Number(dias_anticipacion_max),
      dias_anticipacion_min: Number(dias_anticipacion_min)
    };

    fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), 'utf8');

    res.json({ success: true, message: 'Configuración guardada con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Error al actualizar la configuración' });
  }
});
// ------------------------------------------

app.use('/api/reservations', reservationsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/admin', adminRouter);

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
