const express = require('express');
const router = express.Router();
const db = require('../db');

// Obtener todas las reservas (con filtros opcionales de año y unidad)
router.get('/', (req, res) => {
  try {
    const { year, unit_id } = req.query;
    let reservations = db.reservations.all() || [];

    if (year) {
      reservations = reservations.filter(r => r.date && r.date.startsWith(String(year)));
    }

    if (unit_id) {
      reservations = reservations.filter(r => 
        String(r.unit_id) === String(unit_id) || String(r.unitId) === String(unit_id)
      );
    }

    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las reservas.' });
  }
});

// Crear una reserva nueva
router.post('/', (req, res) => {
  try {
    const { date, turno, unit_id, nombre, apellido, unit_pin } = req.body;

    if (!unit_id) {
      return res.status(400).json({ error: 'Elegí una unidad.' });
    }
    if (!unit_pin || !/^\d{4}$/.test(String(unit_pin))) {
      return res.status(400).json({ error: 'Ingresá el PIN de 4 dígitos de la unidad.' });
    }
    if (!date || !turno) {
      return res.status(400).json({ error: 'Fecha y turno son obligatorios.' });
    }

    const units = db.units.all() || [];
    const targetUnit = units.find(u => 
      String(u.id) === String(unit_id) || String(u.unidad) === String(unit_id)
    );

    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad no encontrada.' });
    }

    if (String(targetUnit.pin || '').trim() !== String(unit_pin).trim()) {
      return res.status(400).json({ error: 'El PIN de la unidad es incorrecto.' });
    }

    // Validar si el turno ya está ocupado en esa fecha
    const allRes = db.reservations.all() || [];
    const occupied = allRes.some(r => r.date === date && r.turno === turno);
    if (occupied) {
      return res.status(400).json({ error: 'Ese turno ya está ocupado. Elegí otro.' });
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

    db.reservations.add(newReservation);

    res.json({ ok: true, success: true, reservation: newReservation });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar la reserva.' });
  }
});

// Cancelar una reserva existente
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { unit_pin } = req.body;

    let allRes = db.reservations.all() || [];
    const reservation = allRes.find(r => String(r.id) === String(id));

    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const units = db.units.all() || [];
    const targetUnit = units.find(u => 
      String(u.unidad) === String(reservation.unit_id) || String(u.id) === String(reservation.unit_id)
    );

    const isAdmin = req.session && req.session.isAdmin;
    if (!isAdmin && (!targetUnit || String(targetUnit.pin).trim() !== String(unit_pin || '').trim())) {
      return res.status(400).json({ error: 'PIN incorrecto para cancelar la reserva.' });
    }

    const filtered = allRes.filter(r => String(r.id) !== String(id));
    db.reservations.saveAll(filtered);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar la reserva.' });
  }
});

module.exports = router;
