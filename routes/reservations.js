const express = require('express');
const router = express.Router();
const db = require('../db'); // Usamos la misma instancia centralizada de la base de datos
const { sendReservationConfirmation } = require('../utils/mailer');

// GET /api/reservations
router.get('/', (req, res) => {
  try {
    const reservations = db.reservations.all();
    res.json(reservations);
  } catch (err) {
    console.error('Error al obtener reservas:', err);
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

    const reservations = db.reservations.all() || [];

    // Validamos si el turno ya está ocupado para esa fecha y turno exactos
    const occupied = reservations.some(r => r && String(r.date).trim() === String(date).trim() && String(r.turno).trim() === String(turno).trim());
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
      date,
      turno,
      createdAt: new Date().toISOString()
    };

    db.reservations.add(newReservation);

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
    let reservations = db.reservations.all() || [];
    const initialLength = reservations.length;
    
    const filtered = reservations.filter(r => String(r.id) !== String(id));
    
    if (filtered.length === initialLength) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    db.reservations.saveAll(filtered);
    res.json({ success: true, message: 'Reserva eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar reserva:', err);
    res.status(500).json({ error: 'Error al eliminar la reserva.' });
  }
});

module.exports = router;
