const express = require('express');
const router = express.Router();
const db = require('../db');

// Obtener todas las reservas (con filtros opcionales de año y unidad)
router.get('/', (req, res) => {
  try {
    const { year, unit_id } = req.query;
    let reservations = typeof db.reservations.all === 'function' ? db.reservations.all() : [];
    
    if (!Array.isArray(reservations)) {
      reservations = [];
    }

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

// Crear una reserva nueva
router.post('/', (req, res) => {
  try {
    const { date, turno, unit_id, nombre, apellido, unit_pin } = req.body;

    if (!unit_id) {
      return res.status(400).json({ error: 'Elegí una unidad.' });
    }
    if (!unit_pin) {
      return res.status(400).json({ error: 'Ingresá el PIN de la unidad.' });
    }
    if (!date || !turno) {
      return res.status(400).json({ error: 'Fecha y turno son obligatorios.' });
    }

    const units = typeof db.units.all === 'function' ? db.units.all() : [];
    
    // Búsqueda flexible de la unidad (admite ID, unidad o texto coincidente)
    const targetUnit = Array.isArray(units) ? units.find(u => {
      if (!u) return false;
      const uId = String(u.id || '').trim();
      const uUnidad = String(u.unidad || '').trim();
      const target = String(unit_id).trim();
      return uId === target || uUnidad === target || target.includes(uUnidad) || uUnidad.includes(target);
    }) : null;

    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad no encontrada en la base de datos.' });
    }

    // Validación de PIN flexible si la unidad tiene uno configurado
    if (targetUnit.pin && String(targetUnit.pin).trim() !== String(unit_pin).trim()) {
      return res.status(400).json({ error: 'El PIN de la unidad es incorrecto.' });
    }

    const allRes = typeof db.reservations.all === 'function' ? db.reservations.all() : [];
    const safeAllRes = Array.isArray(allRes) ? allRes : [];
    
    const occupied = safeAllRes.some(r => r && r.date === date && r.turno === turno);
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

    if (typeof db.reservations.add === 'function') {
      db.reservations.add(newReservation);
    } else {
      safeAllRes.push(newReservation);
      if (typeof db.reservations.saveAll === 'function') {
        db.reservations.saveAll(safeAllRes);
      }
    }

    res.json({ ok: true, success: true, reservation: newReservation });
  } catch (err) {
    console.error("Error al registrar reserva:", err);
    res.status(500).json({ error: 'Error interno al registrar la reserva.' });
  }
});

// Cancelar una reserva existente
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { unit_pin } = req.body;

    let allRes = typeof db.reservations.all === 'function' ? db.reservations.all() : [];
    const safeAllRes = Array.isArray(allRes) ? allRes : [];
    const reservation = safeAllRes.find(r => r && String(r.id) === String(id));

    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const units = typeof db.units.all === 'function' ? db.units.all() : [];
    const targetUnit = Array.isArray(units) ? units.find(u => 
      u && (String(u.unidad) === String(reservation.unit_id) || String(u.id) === String(reservation.unit_id))
    ) : null;

    const isAdmin = req.session && req.session.isAdmin;
    if (!isAdmin && targetUnit && targetUnit.pin && String(targetUnit.pin).trim() !== String(unit_pin || '').trim()) {
      return res.status(400).json({ error: 'PIN incorrecto para cancelar la reserva.' });
    }

    const filtered = safeAllRes.filter(r => r && String(r.id) !== String(id));
    if (typeof db.reservations.saveAll === 'function') {
      db.reservations.saveAll(filtered);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar la reserva.' });
  }
});

module.exports = router;
