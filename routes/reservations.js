const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { sendReservationConfirmation } = require('../utils/mailer');

const dbFile = path.join(__dirname, '../data/reservations.json');
const unitsFile = path.join(__dirname, '../data/units.json');

function readData(filePath, defaultVal) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultVal;
  }
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// GET /api/reservations
router.get('/', (req, res) => {
  const reservations = readData(dbFile, []);
  res.json(reservations);
});

// POST /api/reservations — Crear reserva y enviar mail automático
router.post('/', async (req, res) => {
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

    if (targetUnit.baja === true) {
      return res.status(400).json({ error: 'Esta unidad se encuentra dada de baja y no puede realizar reservas.' });
    }

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

    // Enviar correo electrónico de confirmación si tiene mail válido
    if (targetUnit.email && targetUnit.email.includes('@')) {
      try {
        await sendReservationConfirmation(targetUnit.email, {
          date,
          turno,
          unidad: targetUnit.unidad || targetUnit.id,
          piso: targetUnit.piso,
          dto: targetUnit.dto,
          propietario: targetUnit.propietario
        });
      } catch (mailErr) {
        console.error('[WARNING] No se pudo enviar el correo de confirmación:', mailErr.message);
      }
    }

    res.json({ ok: true, success: true, reservation: newReservation });
  } catch (err) {
    console.error("Error crítico en POST /api/reservations:", err);
    res.status(500).json({ error: 'Error interno al registrar la reserva.' });
  }
});

// DELETE /api/reservations/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    let reservations = readData(dbFile, []);
    const initialLength = reservations.length;
    reservations = reservations.filter(r => String(r.id) !== String(id));
    
    if (reservations.length === initialLength) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    writeData(dbFile, reservations);
    res.json({ success: true, message: 'Reserva eliminada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la reserva.' });
  }
});

module.exports = router;
