const express = require('express');
const router = express.Router();
const db = require('../db');

// Lista pública de unidades (para el desplegable del formulario de reserva)
router.get('/', (req, res) => {
  res.json(db.units.all());
});

module.exports = router;
