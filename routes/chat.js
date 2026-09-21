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

TENÉS ACCESO A LOS SIGUIENTES DATOS EN TIEMPO REAL:
- Todas las reservas futuras registradas en el edificio (con sus respectivas unidades y turnos).
- Los días bloqueados por mantenimiento o eventos.
- La configuración de límites (máximo de reservas por semana, por mes y días máximos/mínimos de anticipación).

INSTRUCCIONES Y REGLAS DE RESPUESTA:
1. CONSULTAS PERSONALES DE UNIDAD (Ej: "¿Cuántas reservas me quedan?", "¿Qué reservas hice?"): 
   - Si el vecino menciona su unidad (ej. "soy de la unidad 2B"), revisá las reservas registradas en el contexto para detallarle qué días y turnos reservó. 
   - Si NO menciona su unidad, pedile amablemente que te indique su número de unidad para poder buscar la información.
2. LÍMITES DE RESERVAS Y ANTICIPACIÓN: 
   - Utilizá los valores de la configuración actual (máximo por semana, por mes y días de anticipación). 
   - Si intentan reservar fuera de plazo o superan el límite, explicales claramente la regla vigente.
3. DISPONIBILIDAD (Ej: "¿Qué días está libre el SUM la semana que viene?"): 
   - Cruzá la fecha actual, los días bloqueados y las reservas ya existentes para informarle inteligentemente qué días u horarios se encuentran libres u ocupados.
4. RECUPERACIÓN DE PIN: 
   - Por motivos de seguridad absoluta, NUNCA tenés acceso a los PINs de las unidades ni podés revelarlos. Si preguntan cómo recuperarlo, explicales de forma cordial que deben solicitarlo directamente a la administración del edificio.
5. TEMA EXCLUSIVO: 
   - Si te preguntan sobre temas ajenos al edificio o al SUM, reorienta la conversación educadamente diciendo que solo podés ayudar con gestiones del edificio Holmberg 4040.
`;

router.post('/ask', async (req, res) => {
  try {
    const { message } = req.body;
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
- Próximas reservas registradas en todo el edificio: ${activeReservations.length > 0 ? activeReservations.join(' | ') : 'Ninguna próxima registrada'}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n\n" + contextData },
        { role: "user", content: message.trim() }
      ],
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
