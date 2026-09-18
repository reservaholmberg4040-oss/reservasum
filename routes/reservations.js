const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, '../data/db.json');
const unitsFile = path.join(__dirname, '../data/units.json');

function readData(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function writeData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// Obtener reservas
router.get('/', (req, res) => {
  try {
    const { year, unit_id } = req.query;
    let reservations = readData(dbFile, []);
    
    if (!Array.isArray(reservations)) reservations = [];

    if (year) {
      reservations = reservations.filter(r => r && r.date && String(r.date).startsWith(String(year)));
    }

    if (unit_id) {
      reservations = reservations.filter(r => r && (
        String(r.unit_id) === String(unit_id) || String(r.unitId) === String(unit_id)
      ));
    }

    res.json(reservations);
  } catch (err) {
    res.json([]);
  }
});

// Crear reserva (con validación estricta de PIN)
router.post('/', (req, res) => {
  try {
    const { date, turno, unit_id, nombre, apellido, unit_pin } = req.body;

    if (!unit_id) {
      return res.status(400).json({ error: 'Elegí una unidad.' });
    }
    if (!date || !turno) {
      return res.status(400).json({ error: 'Fecha y turno son obligatorios.' });
    }

    const units = readData(unitsFile, []);
    const targetUnit = Array.isArray(units) ? units.find(u => {
      if (!u) return false;
      const uId = String(u.id || '').trim();
      const uUnidad = String(u.unidad || '').trim();
      const target = String(unit_id).trim();
      return uId === target || uUnidad === target || target.includes(uUnidad) || uUnidad.includes(target);
    }) : null;

    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad no encontrada.' });
    }

    // Validación estricta: el PIN es obligatorio y debe coincidir exactamente
    const storedPin = String(targetUnit.pin || '').trim();
    const providedPin = String(unit_pin || '').trim();

    if (!providedPin || storedPin !== providedPin) {
      return res.status(400).json({ error: 'El PIN de la unidad es incorrecto o está vacío.' });
    }

    let reservations = readData(dbFile, []);
    if (!Array.isArray(reservations)) reservations = [];

    const occupied = reservations.some(r => r && r.date === date && r.turno === turno);
    if (occupied) {
      return res.status(400).json({ error: 'Ese turno ya está ocupado.' });
    }

    const newReservation = {
      id: Date.now().toString(),
      unit_id: targetUnit.unidad || targetUnit.id,
      piso: targetUnit.piso || '',
      dto: targetUnit.dto || '',
      propietario: targetUnit.propietario || '',
      nombre: nombre || '',
      apellido: apellido || '',
      date,
      turno,
      createdAt: new Date().toISOString()
    };

    reservations.push(newReservation);
    writeData(dbFile, reservations);

    res.json({ ok: true, success: true, reservation: newReservation });
  } catch (err) {
    console.error("Error crítico en POST /api/reservations:", err);
    res.status(500).json({ error: 'Error interno al registrar la reserva.' });
  }
});

// Cancelar reserva
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    let reservations = readData(dbFile, []);
    if (!Array.isArray(reservations)) reservations = [];

    const filtered = reservations.filter(r => r && String(r.id) !== String(id));
    writeData(dbFile, filtered);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar la reserva.' });
  }
});

module.exports = router;
