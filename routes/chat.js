
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Inicializa OpenAI usando la variable de entorno process.env.OPENAI_API_KEY
const openai = new OpenAI();

const reservationsFile = path.join(__dirname, '../data/reservations.json');
const blockedDaysFile = path.join(__dirname, '../data/blocked-days.json');

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

const SYSTEM_PROMPT = `
Sos "HolmIA", el asistente virtual oficial del SUM del edificio Holmberg 4040.
Tu único objetivo es ayudar a los vecinos de forma amable, clara y concisa con las reglas, turnos y estado del SUM.

REGLAS DE SEGURIDAD ABSOLUTAS:
1. NUNCA tenés acceso a los PINs de las unidades ni podés revelarlos bajo ninguna circunstancia. Si un vecino te pide su PIN o credenciales, respondé amablemente que por seguridad debe comunicarse directamente con la administración del edificio.
2. NUNCA inventes reglas que no figuren en la configuración actual del edificio.
3. Si te preguntan sobre temas ajenos al edificio (recetas, política, deportes, etc.), reorienta la conversación educadamente diciendo que solo podés ayudar con temas del SUM y del edificio.
`;

router.post('/ask', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    const reservations = readJsonFile(reservationsFile);
    const blockedDays = readJsonFile(blockedDaysFile);
    const today = new Date().toISOString().slice(0, 10);

    const activeReservations = reservations
      .filter(r => r && r.date >= today)
      .map(r => `Fecha: ${r.date}, Turno: ${r.turno}, Unidad: ${r.unit_id}`);

    const contextData = `
INFORMACIÓN ACTUAL DEL EDIFICIO (Fecha de hoy: ${today}):
- Días bloqueados por mantenimiento o eventos: ${JSON.stringify(blockedDays)}
- Próximas reservas registradas: ${activeReservations.length > 0 ? activeReservations.join(' | ') : 'Ninguna próxima registrada'}
- Reglas generales: Máximo 1 reserva por semana por unidad.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n\n" + contextData },
        { role: "user", content: message.trim() }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    const reply = completion.choices[0].message.content;
    res.json({ success: true, reply });

  } catch (err) {
    console.error('Error en el asistente de chat IA:', err);
    res.status(500).json({ 
      error: 'Lo siento, en este momento el asistente virtual no está disponible. Intentá más tarde.' 
    });
  }
});

module.exports = router;
