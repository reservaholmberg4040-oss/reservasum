const express = require('express');
const router = express.Router();
const db = require('../db');

const TURNOS = ['dia', 'noche'];

function serialize(row) {
  return row;
}

// "Hoy" según la hora de Argentina, sin importar en qué zona horaria corra el servidor (Render usa UTC).
function todayISOAr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // formato YYYY-MM-DD
}

// Público: todas las reservas visibles para todo el que entra a la web (calendario transparente)
router.get('/', (req, res) => {
  const { from, to, year, unit_id } = req.query;
  let rows;
  if (unit_id) rows = db.reservations.byUnit(unit_id);
  else if (year) rows = db.reservations.byYear(year);
  else if (from && to) rows = db.reservations.byRange(from, to);
  else rows = db.reservations.all();
  res.json(rows.map(serialize));
});

// Crear reserva
router.post('/', (req, res) => {
  const { date, turno, unit_id, nombre, apellido } = req.body;

  if (!date || !turno || !unit_id || !nombre || !apellido) {
    return res.status(400).json({ error: 'Faltan datos: fecha, turno, unidad, nombre y apellido son obligatorios.' });
  }
  if (!TURNOS.includes(turno)) {
    return res.status(400).json({ error: 'Turno inválido.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Fecha inválida.' });
  }

  const unit = db.units.byId(unit_id);
  if (!unit) return res.status(400).json({ error: 'Unidad inválida.' });

  const isAdmin = !!(req.session && req.session.isAdmin);
  if (!isAdmin && date < todayISOAr()) {
    return res.status(400).json({ error: 'No se puede reservar en una fecha que ya pasó.' });
  }

  const existing = db.reservations.findConflict(date, turno);
  if (existing) {
    return res.status(409).json({
      error: `Ese turno ya está reservado (Unidad ${existing.unit_id === unit.id ? 'propia' : 'Piso ' + unit.piso}). Elegí otro turno o día.`,
      taken: true
    });
  }

  const row = db.reservations.create({ date, turno, unit_id: Number(unit_id), nombre: nombre.trim(), apellido: apellido.trim() });
  res.status(201).json(serialize(row));
});

// Editar reserva: requiere el PIN de la unidad dueña de la reserva, o ser admin
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { unit_pin, date, turno, nombre, apellido } = req.body;

  const current = db.reservations.byId(id);
  if (!current) return res.status(404).json({ error: 'Reserva no encontrada.' });

  const isAdmin = !!(req.session && req.session.isAdmin);
  if (!isAdmin && !db.units.verifyPin(current.unit_id, unit_pin)) {
    return res.status(403).json({ error: 'PIN incorrecto. No se pudo editar la reserva.' });
  }

  const newDate = date || current.date;
  const newTurno = turno || current.turno;

  if (!isAdmin && newDate < todayISOAr()) {
    return res.status(400).json({ error: 'No se puede mover una reserva a una fecha que ya pasó.' });
  }

  if (newDate !== current.date || newTurno !== current.turno) {
    const conflict = db.reservations.findConflict(newDate, newTurno, id);
    if (conflict) {
      return res.status(409).json({ error: 'Ese turno ya está ocupado. Elegí otro.', taken: true });
    }
  }

  const row = db.reservations.update(id, {
    date: newDate,
    turno: newTurno,
    nombre: nombre || current.nombre,
    apellido: apellido || current.apellido
  });
  res.json(serialize(row));
});

// Cancelar reserva: requiere el PIN de la unidad dueña de la reserva, o ser admin
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const unit_pin = (req.body && req.body.unit_pin) || req.query.unit_pin;

  const current = db.reservations.byId(id);
  if (!current) return res.status(404).json({ error: 'Reserva no encontrada.' });

  const isAdmin = !!(req.session && req.session.isAdmin);
  if (!isAdmin && !db.units.verifyPin(current.unit_id, unit_pin)) {
    return res.status(403).json({ error: 'PIN incorrecto. No se pudo cancelar la reserva.' });
  }

  db.reservations.remove(id);
  res.json({ ok: true });
});

module.exports = router;
