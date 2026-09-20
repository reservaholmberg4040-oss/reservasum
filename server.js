require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');

const db = require('./db');
const unitsRouter = require('./routes/units');
const reservationsRouter = require('./routes/reservations');
const adminRouter = require('./routes/admin');
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

// --- ENDPOINTS DE CONFIGURACIÓN GENERAL ---
app.get('/api/admin/config', async (req, res) => {
  try {
    // Asegurar que la tabla exista para evitar errores iniciales
    await db.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        clave VARCHAR(50) PRIMARY KEY,
        valor VARCHAR(255) NOT NULL
      )
    `);

    const [rows] = await db.query('SELECT clave, valor FROM configuracion');
    const config = rows.reduce((acc, curr) => {
      acc[curr.clave] = curr.valor;
      return acc;
    }, {});

    res.json({ 
      success: true, 
      config: {
        max_reservas_mes: config.max_reservas_mes || 2,
        dias_anticipacion_max: config.dias_anticipacion_max || 60,
        dias_anticipacion_min: config.dias_anticipacion_min !== undefined ? config.dias_anticipacion_min : 0
      } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Error al obtener la configuración' });
  }
});

app.post('/api/admin/config', async (req, res) => {
  try {
    const { max_reservas_mes, dias_anticipacion_max, dias_anticipacion_min } = req.body;
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        clave VARCHAR(50) PRIMARY KEY,
        valor VARCHAR(255) NOT NULL
      )
    `);

    await db.query('REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['max_reservas_mes', max_reservas_mes]);
    await db.query('REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['dias_anticipacion_max', dias_anticipacion_max]);
    await db.query('REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['dias_anticipacion_min', dias_anticipacion_min]);

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
