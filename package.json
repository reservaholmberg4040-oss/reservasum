const express = require('express');
const router = express.Router();
const db = require('../db');

function publicUnit(u) {
  const { pin, ...rest } = u;
  return rest;
}

// Lista pública de unidades (para el desplegable del formulario de reserva) — nunca incluye el PIN
router.get('/', (req, res) => {
  res.json(db.units.all().map(publicUnit));
});

// Verificar el PIN de una unidad, para poder editar/cancelar sus reservas desde "Mis reservas"
// (funciona desde cualquier dispositivo, no depende del navegador que hizo la reserva original)
router.post('/:id/verify-pin', (req, res) => {
  const { pin } = req.body;
  const unit = db.units.byId(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unidad inválida.' });
  const ok = db.units.verifyPin(req.params.id, pin);
  if (!ok) return res.status(401).json({ ok: false, error: 'PIN incorrecto.' });
  res.json({ ok: true });
});

module.exports = router;
