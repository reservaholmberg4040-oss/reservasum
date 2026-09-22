const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('../db'); 
const { sendReservationConfirmation, sendWaitingListAlert } = require('../utils/mailer');

const reservationsFile = path.join(__dirname, '../data/reservations.json');
const blockedDaysFile = path.join(__dirname, '../data/blocked-days.json');
const configFile = path.join(__dirname, '../data/config.json');
const waitingFile = path.join(__dirname, '../data/waiting-list.json');

// --- CONFIGURACIÓN DE RATE LIMITING ---
const reservationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, 
  message: { error: 'Demasiadas solicitudes de reserva desde esta IP, por favor intentá más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const pinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5, 
  message: { error: 'Demasiados intentos con PIN desde esta IP. Por seguridad, esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

function readBlockedDays() {
  try {
    if (!fs.existsSync(blockedDaysFile)) return [];
    const data = fs.readFileSync(blockedDaysFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function readConfig() {
  try {
    if (!fs.existsSync(configFile)) {
      return { max_reservas_mes: 4, max_reservas_semana: 1, dias_anticipacion_max: 60, dias_anticipacion_min: 0 };
    }
    const data = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { max_reservas_mes: 4, max_reservas_semana: 1, dias_anticipacion_max: 60, dias_anticipacion_min: 0 };
  }
}

function readWaitingList() {
  try {
    if (!fs.existsSync(waitingFile)) return [];
    const data = fs.readFileSync(waitingFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
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

function sanitizeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[<>]/g, '')
    .trim();
}

function getWeekRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(d.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: sunday };
}

router.get('/blocked-days', (req, res) => {
  res.json(readBlockedDays());
});

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

// POST /api/reservations
router.post('/', reservationLimiter, pinLimiter, async (req, res) => {
  try {
    const { date, turno, unit_id, nombre, apellido, unit_pin } = req.body;

    if (!unit_id) {
      return res.status(400).json({ error: 'Elegí una unidad.' });
    }
    if (!date || !turno) {
      return res.status(400).json({ error: 'Fecha y turno son obligatorios.' });
    }

    const cleanNombre = sanitizeText(nombre);
    const cleanApellido = sanitizeText(apellido);

    if (!cleanNombre || cleanNombre.length < 2 || cleanNombre.length > 50) {
      return res.status(400).json({ error: 'El nombre es obligatorio y debe tener entre 2 y 50 caracteres.' });
    }
    if (!cleanApellido || cleanApellido.length < 2 || cleanApellido.length > 50) {
      return res.status(400).json({ error: 'El apellido es obligatorio y debe tener entre 2 y 50 caracteres.' });
    }

    const blockedDays = readBlockedDays();
    const blockInfo = blockedDays.find(b => b.date === String(date).trim());
    if (blockInfo) {
      return res.status(400).json({ 
        error: `No se puede reservar este día. Motivo: ${blockInfo.reason || 'Mantenimiento del SUM'}` 
      });
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

    if (!storedPin) {
      return res.status(400).json({ error: 'Esta unidad no tiene un PIN configurado en el sistema.' });
    }

    if (!providedPin || !/^\d+$/.test(providedPin) || storedPin !== providedPin) {
      return res.status(400).json({ error: 'El PIN ingresado es incorrecto o está vacío.' });
    }

    let reservations = readReservations();
    const config = readConfig();

    const unitIdentifier = String(targetUnit.unidad || targetUnit.id).trim();
    const unitUnidad = String(targetUnit.unidad || '').trim();
    const unitId = String(targetUnit.id || '').trim();

    const belongsToUnit = (rUnit) => {
      const u = String(rUnit || '').trim();
      return u === unitIdentifier || (unitUnidad && u === unitUnidad) || (unitId && u === unitId);
    };

    const maxDiasAnticipacion = Number(config.dias_anticipacion_max) || 60;
    const minDiasAnticipacion = Number(config.dias_anticipacion_min) || 0;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaReserva = new Date(date + 'T00:00:00');
    
    const diferenciaTiempo = fechaReserva.getTime() - hoy.getTime();
    const diferenciaDias = Math.ceil(diferenciaTiempo / (1000 * 3600 * 24));

    if (diferenciaDias > maxDiasAnticipacion) {
      return res.status(400).json({ error: `No se puede reservar con más de ${maxDiasAnticipacion} días de anticipación.` });
    }

    if (diferenciaDias < minDiasAnticipacion) {
      return res.status(400).json({ error: `La reserva debe realizarse con al menos ${minDiasAnticipacion} días de anticipación.` });
    }

    const maxReservasSemana = Number(config.max_reservas_semana) || 1;
    const { start: weekStart, end: weekEnd } = getWeekRange(date);

    const reservasDeLaSemana = reservations.filter(r => {
      if (!r) return false;
      const rDateStr = String(r.date || '').trim();
      const rDate = new Date(rDateStr + 'T00:00:00');
      return belongsToUnit(r.unit_id) && rDate >= weekStart && rDate <= weekEnd;
    });

    if (reservasDeLaSemana.length >= maxReservasSemana) {
      return res.status(400).json({ 
        error: `Has superado el límite de reservas permitidas para esta semana (${maxReservasSemana} por semana).` 
      });
    }

    const maxReservasMes = Number(config.max_reservas_mes) || 4;
    const targetDateObj = new Date(date + 'T00:00:00');
    const targetYear = targetDateObj.getFullYear();
    const targetMonth = targetDateObj.getMonth();

    const reservasDelMes = reservations.filter(r => {
      if (!r) return false;
      const rDate = new Date(String(r.date || '').trim() + 'T00:00:00');
      return belongsToUnit(r.unit_id) && 
             rDate.getFullYear() === targetYear && 
             rDate.getMonth() === targetMonth;
    });

    if (reservasDelMes.length >= maxReservasMes) {
      return res.status(400).json({ 
        error: `Has superado el límite de reservas permitidas para este mes (${maxReservasMes} por mes).` 
      });
    }

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

    const deptoVal = targetUnit.depto || targetUnit.dto || targetUnit.departamento || '';
    const pisoVal = targetUnit.piso || '';

    const newReservation = {
      id: Date.now().toString(),
      unit_id: unitIdentifier,
      piso: String(pisoVal),
      depto: String(deptoVal),
      dto: String(deptoVal),
      propietario: String(targetUnit.propietario || ''),
      nombre: cleanNombre,
      apellido: cleanApellido,
      date: String(date).trim(),
      turno: String(turno).trim(),
      createdAt: new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T') + '-03:00'
    };

    reservations.push(newReservation);
    writeReservations(reservations);

    db.auditLogs.add('RESERVA_CREADA', `Unidad ${unitIdentifier} reservó el día ${date} (${turno}) a nombre de ${cleanNombre} ${cleanApellido}`, `Unidad ${unitIdentifier}`);

    res.json({ ok: true, success: true, reservation: newReservation });

    if (targetUnit.email && targetUnit.email.includes('@')) {
      setImmediate(async () => {
        try {
          await sendReservationConfirmation(targetUnit.email, {
            date,
            turno,
            unidad: unitIdentifier,
            piso: pisoVal,
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

// PUT /api/reservations/:id
router.put('/:id', pinLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, turno, nombre, apellido, unit_pin } = req.body;

    let reservations = readReservations();
    const index = reservations.findIndex(r => String(r.id) === String(id));

    if (index === -1) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const currentRes = reservations[index];

    if (date) {
      const blockedDays = readBlockedDays();
      const blockInfo = blockedDays.find(b => b.date === String(date).trim());
      if (blockInfo) {
        return res.status(400).json({ error: `No se puede mover la reserva a este día. Motivo: ${blockInfo.reason || 'Mantenimiento'}` });
      }
    }

    const units = db.units.all();
    const targetUnit = units.find(u => String(u.unidad || u.id) === String(currentRes.unit_id));

    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad asociada no encontrada.' });
    }

    const storedPin = String(targetUnit.pin || '').trim();
    const cleanPin = String(unit_pin || '').trim();

    if (!storedPin) {
      return res.status(400).json({ error: 'Esta unidad no tiene un PIN configurado en el sistema.' });
    }

    if (!cleanPin || !/^\d+$/.test(cleanPin) || storedPin !== cleanPin) {
      return res.status(400).json({ error: 'El PIN ingresado es incorrecto o no es numérico.' });
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

    const cleanNombre = nombre !== undefined ? sanitizeText(nombre) : currentRes.nombre;
    const cleanApellido = apellido !== undefined ? sanitizeText(apellido) : currentRes.apellido;

    if (nombre !== undefined && (cleanNombre.length < 2 || cleanNombre.length > 50)) {
      return res.status(400).json({ error: 'El nombre debe tener entre 2 y 50 caracteres.' });
    }
    if (apellido !== undefined && (cleanApellido.length < 2 || cleanApellido.length > 50)) {
      return res.status(400).json({ error: 'El apellido debe tener entre 2 y 50 caracteres.' });
    }

    reservations[index] = {
      ...currentRes,
      date: date ? String(date).trim() : currentRes.date,
      turno: turno ? String(turno).trim() : currentRes.turno,
      nombre: cleanNombre,
      apellido: cleanApellido
    };

    writeReservations(reservations);
    db.auditLogs.add('RESERVA_MODIFICADA', `Unidad ${currentRes.unit_id} modificó la reserva (Nueva fecha: ${reservations[index].date}, Turno: ${reservations[index].turno})`, `Unidad ${currentRes.unit_id}`);

    res.json({ ok: true, success: true, reservation: reservations[index] });
  } catch (err) {
    console.error('Error al actualizar reserva:', err);
    res.status(500).json({ error: 'Error al actualizar la reserva.' });
  }
});

// DELETE /api/reservations/:id
router.delete('/:id', pinLimiter, (req, res) => {
  try {
    const { id } = req.params;
    const { unit_pin } = req.body || {};

    let reservations = readReservations();
    const reservation = reservations.find(r => String(r.id) === String(id));
    
    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    if (unit_pin) {
      const cleanPin = String(unit_pin).trim();
      const units = db.units.all();
      const targetUnit = units.find(u => String(u.unidad || u.id) === String(reservation.unit_id));
      
      const storedPin = targetUnit ? String(targetUnit.pin || '').trim() : '';
      if (!storedPin || storedPin !== cleanPin) {
        return res.status(400).json({ error: 'PIN incorrecto o la unidad no tiene PIN configurado.' });
      }
    }

    const filtered = reservations.filter(r => String(r.id) !== String(id));
    writeReservations(filtered);

    db.auditLogs.add('RESERVA_CANCELADA', `Se canceló la reserva de la Unidad ${reservation.unit_id} para el día ${reservation.date} (${reservation.turno})`, `Unidad ${reservation.unit_id}`);

    res.json({ success: true, message: 'Reserva eliminada correctamente.' });

    // --- AUTOMATIZACIÓN: AVISAR A LA LISTA DE ESPERA ---
    setImmediate(async () => {
      try {
        const waitingList = readWaitingList();
        // Filtrar quienes están anotados exactamente para la misma fecha y turno
        const matches = waitingList.filter(item => 
          String(item.date) === String(reservation.date) && 
          normalizeStr(item.turno) === normalizeStr(reservation.turno)
        );

        if (matches.length > 0) {
          const units = db.units.all();
          for (const entry of matches) {
            const unitData = units.find(u => String(u.unidad || u.id) === String(entry.unit_id));
            if (unitData && unitData.email && unitData.email.includes('@')) {
              await sendWaitingListAlert(unitData.email, {
                date: reservation.date,
                turno: reservation.turno,
                propietario: unitData.propietario || entry.propietario
              });
            }
          }
          console.log(`[waiting-list] Se enviaron avisos de disponibilidad para el ${reservation.date} (${reservation.turno}) a ${matches.length} unidades.`);
        }
      } catch (errMail) {
        console.error('[WARNING] Error enviando alertas de lista de espera en segundo plano:', errMail.message);
      }
    });

  } catch (err) {
    console.error('Error al eliminar reserva:', err);
    res.status(500).json({ error: 'Error al eliminar la reserva.' });
  }
});

module.exports = router;
