const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', (req, res) => {
  const { unitId, unidad, unit, pin, name, lastName, date, shift } = req.body;
  const rawUnitId = String(unitId || unidad || unit || '').trim();

  if (!rawUnitId) {
    return res.status(400).json({ error: 'Elegí una unidad.' });
  }

  const units = typeof db.units.all === 'function' ? db.units.all() : [];

  // Búsqueda tolerante a variaciones y ceros a la izquierda
  const targetUnit = units.find(u => {
    const dbId = String(u.id || '').trim();
    const dbUnidad = String(u.unidad || '').trim();
    const cleanRaw = rawUnitId.replace(/^0+/, '');
    const cleanDbId = dbId.replace(/^0+/, '');
    const cleanDbUnidad = dbUnidad.replace(/^0+/, '');

    return (
      dbId === rawUnitId ||
      dbUnidad === rawUnitId ||
      (cleanRaw !== '' && (cleanRaw === cleanDbId || cleanRaw === cleanDbUnidad))
    );
  });

  if (!targetUnit) {
    return res.status(400).json({ error: 'Elegí una unidad.' });
  }

  if (String(targetUnit.pin || '').trim() !== String(pin || '').trim()) {
    return res.status(400).json({ error: 'El PIN de la unidad es incorrecto.' });
  }

  try {
    const reservationData = {
      unitId: targetUnit.unidad || targetUnit.id,
      piso: targetUnit.piso || '',
      dto: targetUnit.dto || '',
      propietario: targetUnit.propietario || '',
      name: name || '',
      lastName: lastName || '',
      date,
      shift,
      createdAt: new Date().toISOString()
    };

    let newReservation;
    if (typeof db.reservations.add === 'function') {
      newReservation = db.reservations.add(reservationData);
    } else if (typeof db.reservations.create === 'function') {
      newReservation = db.reservations.create(reservationData);
    }

    res.json({ ok: true, success: true, reservation: newReservation });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar la reserva.' });
  }
});

module.exports = router;
