const express = require('express');
const router = express.Router();
const db = require('../db');

// --- Listar reservas (con soporte para filtrar por year o unit_id) ---
router.get('/', (req, res) => {
  try {
    const { year, unit_id } = req.query;
    let reservations = typeof db.reservations.all === 'function' ? db.reservations.all() : [];

    if (year) {
      reservations = reservations.filter(r => r.date && r.date.startsWith(String(year)));
    }

    if (unit_id) {
      reservations = reservations.filter(r => String(r.unit_id) === String(unit_id) || String(r.unitId) === String(unit_id));
    }

    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las reservas.' });
  }
});

// --- Crear reserva ---
router.post('/', (req, res) => {
  try {
    const { unitId, unidad, unit, unit_id, pin, unit_pin, name, lastName, nombre, apellido, date, turno, shift } = req.body;
    
    const targetUnitId = String(unitId || unidad || unit || unit_id || '').trim();
    const targetPin = String(pin || unit_pin || '').trim();
    const finalName = String(nombre || name || '').trim();
    const finalLastName = String(apellido || lastName || '').trim();
    const finalTurno = String(turno || shift || 'dia').trim();

    if (!targetUnitId) {
      return res.status(400).json({ error: 'Elegí una unidad.' });
    }

    const units = typeof db.units.all === 'function' ? db.units.all() : [];
    const targetUnit = units.find(u => String(u.id) === targetUnitId || String(u.unidad) === targetUnitId);

    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad no encontrada.' });
    }

    if (String(targetUnit.pin || '').trim() !== targetPin) {
      return res.status(400).json({ error: 'El PIN de la unidad es incorrecto.' });
    }

    // Verificar si el turno ya está ocupado en esa fecha
    const allRes = typeof db.reservations.all === 'function' ? db.reservations.all() : [];
    const occupied = allRes.some(r => r.date === date && r.turno === finalTurno);
    if (occupied) {
      return res.status(400).json({ error: 'Ese turno ya está ocupado. Elegí otro.' });
    }

    const newReservation = {
      id: Date.now().toString(),
      unit_id: targetUnit.unidad || targetUnit.id,
      piso: targetUnit.piso || '',
      dto: targetUnit.dto || '',
      propietario: targetUnit.propietario || '',
      nombre: finalName,
      apellido: finalLastName,
      date,
      turno: finalTurno,
      createdAt: new Date().toISOString()
    };

    if (typeof db.reservations.add === 'function') {
      db.reservations.add(newReservation);
    }

    res.json({ ok: true, success: true, reservation: newReservation });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar la reserva.' });
  }
});

// --- Actualizar reserva ---
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { unit_pin, date, turno, nombre, apellido } = req.body;

    const allRes = typeof db.reservations.all === 'function' ? db.reservations.all() : [];
    const reservation = allRes.find(r => String(r.id) === String(id));

    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    // Validar PIN de la unidad dueña de la reserva o admin
    const units = typeof db.units.all === 'function' ? db.units.all() : [];
    const targetUnit = units.find(u => String(u.unidad) === String(reservation.unit_id) || String(u.id) === String(reservation.unit_id));

    const isAdmin = req.session && req.session.isAdmin;
    if (!isAdmin && (!targetUnit || String(targetUnit.pin).trim() !== String(unit_pin || '').trim())) {
      return res.status(400).json({ error: 'PIN incorrecto para modificar la reserva.' });
    }

    reservation.date = date || reservation.date;
    reservation.turno = turno || reservation.turno;
    reservation.nombre = nombre || reservation.nombre;
    reservation.apellido = apellido || reservation.apellido;

    if (typeof db.reservations.saveAll === 'function') {
      db.reservations.saveAll(allRes);
    }

    res.json({ ok: true, reservation });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la reserva.' });
  }
});

// --- Eliminar reserva ---
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { unit_pin } = req.body;

    let allRes = typeof db.reservations.all === 'function' ? db.reservations.all() : [];
    const reservation = allRes.find(r => String(r.id) === String(id));

    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const units = typeof db.units.all === 'function' ? db.units.all() : [];
    const targetUnit = units.find(u => String(u.unidad) === String(reservation.unit_id) || String(u.id) === String(reservation.unit_id));

    const isAdmin = req.session && req.session.isAdmin;
    if (!isAdmin && (!targetUnit || String(targetUnit.pin).trim() !== String(unit_pin || '').trim())) {
      return res.status(400).json({ error: 'PIN incorrecto para cancelar la reserva.' });
    }

    allRes = allRes.filter(r => String(r.id) !== String(id));

    if (typeof db.reservations.saveAll === 'function') {
      db.reservations.saveAll(allRes);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar la reserva.' });
  }
});

module.exports = router;
