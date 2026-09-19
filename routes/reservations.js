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

// GET /api/reservations — Soporta filtros exactos por ?year=YYYY y ?unit_id=X
router.get('/', (req, res) => {
  try {
    let reservations = readReservations();
    const { year, unit_id } = req.query;

    if (year) {
      reservations = reservations.filter(r => r && r.date && String(r.date).startsWith(String(year)));
    }

    if (unit_id) {
      const target = String(unit_id).trim();
      reservations = reservations.filter(r => {
        if (!r) return false;
        const rUnit = String(r.unit_id || '').trim();
        return rUnit === target;
      });
    }

    res.json(reservations);
  } catch (err) {
    console.error('Error en GET /api/reservations:', err);
    res.status(500).json({ error: 'Error al obtener las reservas.' });
  }
});

// POST /api/reservations — Crear reserva de forma inmediata y enviar mail en segundo plano
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
      return uId === target || uUnidad === target;
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

    const deptoVal = targetUnit.depto || targetUnit.dto || '';

    const newReservation = {
      id: Date.now().toString(),
      unit_id: String(targetUnit.unidad || targetUnit.id),
      piso: String(targetUnit.piso || ''),
      depto: String(deptoVal),
      dto: String(deptoVal), // Compatibilidad
      propietario: String(targetUnit.propietario || ''),
      nombre: String(nombre || '').trim(),
      apellido: String(apellido || '').trim(),
      date: String(date).trim(),
      turno: String(turno).trim(),
      createdAt: new Date().toISOString()
    };

    reservations.push(newReservation);
    writeReservations(reservations);

    // Responder inmediatamente al navegador para evitar demoras visuales
    res.json({ ok: true, success: true, reservation: newReservation });

    // Enviar correo electrónico en segundo plano de forma no bloqueante
    if (targetUnit.email && targetUnit.email.includes('@')) {
      setImmediate(async () => {
        try {
          await sendReservationConfirmation(targetUnit.email, {
            date,
            turno,
            unidad: targetUnit.unidad || targetUnit.id,
            piso: targetUnit.piso,
            dto: deptoVal,
            propietario: targetUnit.propietario
          });
        } catch (mailErr) {
          console.error('[WARNING] No se pudo enviar el correo en segundo plano:', mailErr.message);
        }
      });
    }
  } catch (err) {
    console.error("Error crítico en POST /api/reservations:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno al registrar la reserva.' });
    }
  }
});

// PUT /api/reservations/:id — Actualizar reserva existente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, turno, nombre, apellido, unit_pin } = req.body;

    let reservations = readReservations();
    const index = reservations.findIndex(r => String(r.id) === String(id));

    if (index === -1) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const currentRes = reservations[index];
    const units = db.units.all();
    const targetUnit = units.find(u => String(u.unidad || u.id) === String(currentRes.unit_id));

    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad asociada no encontrada.' });
    }

    if (targetUnit.pin && String(targetUnit.pin).trim() !== String(unit_pin || '').trim()) {
      return res.status(400).json({ error: 'El PIN ingresado es incorrecto.' });
    }

    if (date && turno && (date !== currentRes.date || turno !== currentRes.turno)) {
      const occupied = reservations.some(r => {
        if (!r || String(r.id) === String(id)) return false;
        return String(r.date) === String(date) && normalizeStr(r.turno) === normalizeStr(turno);
      });
      if (occupied) {
        return res.status(400).json({ error: 'Ese turno ya se encuentra ocupado.' });
      }
    }

    reservations[index] = {
      ...currentRes,
      date: date ? String(date).trim() : currentRes.date,
      turno: turno ? String(turno).trim() : currentRes.turno,
      nombre: nombre !== undefined ? String(nombre).trim() : currentRes.nombre,
      apellido: apellido !== undefined ? String(apellido).trim() : currentRes.apellido
    };

    writeReservations(reservations);
    res.json({ ok: true, success: true, reservation: reservations[index] });
  } catch (err) {
    console.error('Error al actualizar reserva:', err);
    res.status(500).json({ error: 'Error al actualizar la reserva.' });
  }
});

// DELETE /api/reservations/:id — Eliminar reserva validando PIN
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { unit_pin } = req.body || {};

    let reservations = readReservations();
    const reservation = reservations.find(r => String(r.id) === String(id));
    
    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    if (unit_pin) {
      const units = db.units.all();
      const targetUnit = units.find(u => String(u.unidad || u.id) === String(reservation.unit_id));
      if (targetUnit && targetUnit.pin && String(targetUnit.pin).trim() !== String(unit_pin).trim()) {
        return res.status(400).json({ error: 'PIN incorrecto para cancelar la reserva.' });
      }
    }

    const filtered = reservations.filter(r => String(r.id) !== String(id));
    writeReservations(filtered);
    res.json({ success: true, message: 'Reserva eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar reserva:', err);
    res.status(500).json({ error: 'Error al eliminar la reserva.' });
  }
});

module.exports = router;
