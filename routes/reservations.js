const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db'); 
const { sendReservationConfirmation } = require('../utils/mailer');

const reservationsFile = path.join(__dirname, '../data/reservations.json');

function readReservations() {
  try {
    if (!fs.existsSync(reservationsFile)) return [];
    const data = fs.readFileSync(reservationsFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error leyendo reservations.json:', err);
    return [];
  }
}

function writeReservations(data) {
  try {
    const dir = path.dirname(reservationsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(reservationsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo reservations.json:', err);
    throw err;
  }
}

function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// GET /api/reservations — Soporta filtros por ?year=YYYY y ?unit_id=X
router.get('/', (req, res) => {
  try {
    let reservations = readReservations();
    const { year, unit_id } = req.query;

    if (year) {
      reservations = reservations.filter(r => r && r.date && String(r.date).startsWith(String(year)));
    }

    if (unit_id) {
      reservations = reservations.filter(r => {
        if (!r) return false;
        const rUnit = String(r.unit_id || '').trim();
        const target = String(unit_id).trim();
        return rUnit === target || target.includes(rUnit) || rUnit.includes(target);
      });
    }

    res.json(reservations);
  } catch (err) {
    console.error('Error en GET /api/reservations:', err);
    res.status(500).json({ error: 'Error al obtener las reservas.' });
  }
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

    const units = db.units.all();
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

    let reservations = readReservations();

    // Comprobación exacta de disponibilidad por fecha y turno normalizado
    const occupied = reservations.some(r => {
      if (!r) return false;
      const rDate = String(r.date || '').trim();
      const rTurnoNorm = normalizeStr(r.turno);
      const reqTurnoNorm = normalizeStr(turno);
      return rDate === String(date).trim() && rTurnoNorm === reqTurnoNorm;
    });

    if (occupied) {
      return res.status(400).json({ error: 'Ese turno ya está ocupado.' });
    }

    const newReservation = {
      id: Date.now().toString(),
      unit_id: targetUnit.unidad || targetUnit.id,
      piso: targetUnit.piso || '',
      depto: targetUnit.depto || targetUnit.dto || '',
      propietario: targetUnit.propietario || '',
      nombre: nombre || '',
      apellido: apellido || '',
      date: String(date).trim(),
      turno: String(turno).trim(),
      createdAt: new Date().toISOString()
    };

    reservations.push(newReservation);
    writeReservations(reservations);

    // Enviar correo electrónico de confirmación si tiene mail válido
    if (targetUnit.email && targetUnit.email.includes('@')) {
      try {
        await sendReservationConfirmation(targetUnit.email, {
          date,
          turno,
          unidad: targetUnit.unidad || targetUnit.id,
          piso: targetUnit.piso,
          dto: targetUnit.depto || targetUnit.dto,
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
    let reservations = readReservations();
    const initialLength = reservations.length;
    
    const filtered = reservations.filter(r => String(r.id) !== String(id));
    
    if (filtered.length === initialLength) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    writeReservations(filtered);
    res.json({ success: true, message: 'Reserva eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar reserva:', err);
    res.status(500).json({ error: 'Error al eliminar la reserva.' });
  }
});

module.exports = router;
