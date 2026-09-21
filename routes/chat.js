const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI();

const reservationsFile = path.join(__dirname, '../data/reservations.json');
const blockedDaysFile = path.join(__dirname, '../data/blocked-days.json');
const configFile = path.join(__dirname, '../data/config.json');

function readJsonFile(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return defaultValue;
  }
}

const SYSTEM_PROMPT = `
Sos "HolmIA", el asistente virtual oficial del SUM del edificio Holmberg 4040.
Tu objetivo es ayudar a los vecinos de forma amable, clara y concisa con las reglas, turnos y estado del SUM.

TIENES ACCESO A LOS SIGUIENTES DATOS EN TIEMPO REAL:
- Todas las reservas futuras registradas en el edificio (con sus respectivas unidades y turnos). Formato de unidades en el sistema (ej: "3D", "13", etc.).
- Los días bloqueados por mantenimiento o eventos.
- La configuración de límites (máximo de reservas por semana, por mes y días máximos de anticipación).

INSTRUCCIONES CLAVE PARA LA CONVERSACIÓN:
1. MEMORIA DE UNIDAD: Si en los mensajes anteriores el usuario ya indicó su unidad (por ejemplo, "3D" o "unidad 13"), recuérdala y úsala para buscar sus reservas en la lista de reservas activas. No vuelvas a pedir el número de unidad si ya te lo dieron en la conversación.
2. CONSULTAS DE RESERVAS: Si te piden ver sus reservas y ya sabes la unidad, busca en las reservas activas y detalla las fechas y turnos correspondientes. Si no hay ninguna, indícalo amablemente.
3. LÍMITES Y ANTICIPACIÓN: Utiliza los valores de configuración actual (máximo por semana, por mes y días de anticipación).
4. SEGURIDAD DE PINs: NUNCA tienes acceso a los PINs de las unidades ni puedes revelarlos. Si preguntan por su PIN, indícales amablemente que deben solicitarlo a la administración.
5. TEMA EXCLUSIVO: Responde únicamente sobre temas del edificio Holmberg 4040 y el SUM. Si te dan una respuesta corta como "sí" o un número de unidad suelto, interprétalo en el contexto de lo que venían charlando.
`;

router.post('/ask', async (req, res) => {
  try {
    // Ahora recibimos también el historial de mensajes si el frontend lo envía, o manejamos el mensaje actual
    const { message, history } = req.body; 
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    const reservations = readJsonFile(reservationsFile, []);
    const blockedDays = readJsonFile(blockedDaysFile, []);
    const buildingConfig = readJsonFile(configFile, { 
      max_reservas_mes: 1, 
      max_reservas_semana: 1, 
      dias_anticipacion_max: 60, 
      dias_anticipacion_min: 0 
    });
    
    const today = new Date().toISOString().slice(0, 10);

    const activeReservations = Array.isArray(reservations) 
      ? reservations.filter(r => r && r.date >= today).map(r => `Fecha: ${r.date}, Turno: ${r.turno}, Unidad: ${r.unit_id}`)
      : [];

    const contextData = `
INFORMACIÓN ACTUAL DEL EDIFICIO (Fecha de hoy: ${today}):
- Configuración de límites: Máximo ${buildingConfig.max_reservas_semana} reserva(s) por semana, Máximo ${buildingConfig.max_reservas_mes} reserva(s) por mes.
- Anticipación máxima permitida: ${buildingConfig.dias_anticipacion_max} días desde hoy.
- Días bloqueados por mantenimiento: ${JSON.stringify(blockedDays)}
- Próximas reservas registradas en todo el edificio (CRUCIAL PARA BUSCAR POR UNIDAD): ${activeReservations.length > 0 ? activeReservations.join(' | ') : 'Ninguna próxima registrada'}
`;

    // Armamos el array de mensajes para OpenAI incluyendo el historial previo si existe
    let messages = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + contextData }
    ];

    if (Array.isArray(history) && history.length > 0) {
      // history debe venir como un array de { role: 'user'|'assistant', content: '...' }
      messages.push(...history);
    }

    messages.push({ role: "user", content: message.trim() });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.3,
      max_tokens: 350
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
