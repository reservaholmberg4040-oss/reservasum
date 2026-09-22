const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('./admin');

const waitingFile = path.join(__dirname, '../data/waiting-list.json');
const reservationsFile = path.join(__dirname, '../data/reservations.json');

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

function writeWaitingList(data) {
  const dir = path.dirname(waitingFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(waitingFile, JSON.stringify(data, null, 2), 'utf8');
}

function readReservations() {
  try {
    if (!fs.existsSync(reservationsFile)) return [];
    const data = fs.readFileSync(reservationsFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

// Obtener lista de espera (Público o Admin)
router.get('/', (req, res) => {
  try {
    const list = readWaitingList();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la lista de espera.' });
  }
});

// Anotarse en lista de espera cuando un turno está ocupado
router.post('/', (req, res) => {
  try {
    const { date, turno, unit_id, nombre, apellido, unit_pin } = req.body;

    if (!date || !turno || !unit_id) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para la lista de espera.' });
    }

    const units = db.units.all();
    const targetUnit = units.find(u => String(u.unidad || u.id) === String(unit_id));
    if (!targetUnit) {
      return res.status(400).json({ error: 'Unidad no encontrada.' });
    }

    if (targetUnit.pin && String(targetUnit.pin) !== String(unit_pin)) {
      return res.status(400).json({ error: 'PIN incorrecto.' });
    }

    // Validar si esta unidad ya es la dueña de la reserva en este turno y fecha
    const existingReservations = readReservations();
    const currentReservation = existingReservations.find(r => r.date === date && r.turno === turno);
    
    if (currentReservation && String(currentReservation.unit_id) === String(unit_id)) {
      return res.status(400).json({ error: 'No podés anotarte en la lista de espera de un turno que ya tenés reservado.' });
    }

    let list = readWaitingList();
    
    // Verificar si ya está anotado en ese mismo turno y fecha
    const exists = list.some(item => item.date === date && item.turno === turno && String(item.unit_id) === String(unit_id));
    if (exists) {
      return res.status(400).json({ error: 'Ya estás anotado en la lista de espera para este turno.' });
    }

    const newItem = {
      id: Date.now().toString(),
      date,
      turno,
      unit_id: String(unit_id),
      propietario: targetUnit.propietario || '',
      nombre: nombre || '',
      apellido: apellido || '',
      createdAt: new Date().toISOString()
    };

    list.push(newItem);
    writeWaitingList(list);

    db.auditLogs.add('LISTA_ESPERA_AGREGADA', `Unidad ${unit_id} se anotó en lista de espera para el ${date} (${turno})`, `Unidad ${unit_id}`);

    res.json({ success: true, message: 'Te has anotado en la lista de espera correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrarse en la lista de espera.' });
  }
});

// Eliminar / Validar solicitud de lista de espera (Admin)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    let list = readWaitingList();
    const filtered = list.filter(item => String(item.id) !== String(id));

    if (list.length === filtered.length) {
      return res.status(404).json({ error: 'Registro no encontrado.' });
    }

    writeWaitingList(filtered);
    res.json({ success: true, message: 'Registro eliminado de la lista de espera.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
});

module.exports = router;
