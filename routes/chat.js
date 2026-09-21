const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI();

const reservationsFile = path.join(__dirname, '../data/reservations.json');
const blockedDaysFile = path.join(__dirname, '../data/blocked-days.json');
const configFile = path.join(__dirname, '../data/config.json');
const reglamentoFile = path.join(__dirname, '../data/reglamento.txt');

function readJsonFile(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return defaultValue;
  }
}

function readTextFile(filePath, defaultValue = '') {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return defaultValue;
  }
}

const SYSTEM_PROMPT = `
Sos "HolmIA", el asistente virtual oficial del SUM y del edificio Holmberg 4040.
Tu objetivo es ayudar a los vecinos de forma amable, clara y concisa con las reglas, turnos, penalidades y estado del SUM y la pileta, basándote estrictamente en el reglamento oficial del edificio.

TIENES ACCESO A LOS SIGUIENTES DATOS EN TIEMPO REAL:
- El reglamento completo del SUM y de la Pileta (horarios, invitados, sanciones, aranceles, prohibiciones).
- Todas las reservas futuras registradas en el edificio (con sus respectivas unidades, fechas, turnos y nombres). 
- Los días bloqueados por mantenimiento, reparaciones o eventos de la administración.
- La configuración de límites (máximo de reservas por semana, por mes y días máximos de anticipación).

INSTRUCCIONES CLAVE PARA LA CONVERSACIÓN:
1. REGLAMENTO Y NORMATIVA: Responde cualquier duda sobre horarios (turnos día/noche, pileta), invitados permitidos, prohibiciones (mascotas, música, prohibición de fumar, alcohol en solárium), limpieza obligatoria, aranceles o multas basándote en el texto del reglamento provisto.
2. MEMORIA Y BÚSQUEDA DE UNIDAD: Si en los mensajes anteriores el usuario ya indicó su unidad (por ejemplo, "3D" o "unidad 13"), recuérdala y busca en las reservas activas las coincidencias para informarle sus turnos y nombres exactos. No vuelvas a pedir el número de unidad si ya te lo dieron.
3. LÍMITES Y ANTICIPACIÓN: Utiliza OBLIGATORIAMENTE los valores numéricos exactos provistos en la sección "INFORMACIÓN ACTUAL DEL EDIFICIO" (como max_reservas_mes y max_reservas_semana). No repites valores antiguos si la configuración cambió recientemente.
4. VALIDACIÓN DE DÍAS BLOQUEADOS Y MANTENIMIENTO: Si un vecino consulta por la disponibilidad de una fecha específica y esa fecha figura en la lista de días bloqueados, explícale con amabilidad que el SUM no se encuentra disponible debido a tareas de mantenimiento o restricciones dispuestas por la administración.
5. SEGURIDAD DE PINs: NUNCA tienes acceso a los PINs de las unidades ni puedes revelarlos. Si preguntan por su PIN, indícales amablemente que deben solicitarlo a la administración.
6. TEMA EXCLUSIVO: Responde únicamente sobre temas del edificio Holmberg 4040, el SUM y la pileta. Si te dan una respuesta corta como "sí" o un número de unidad suelto, interprétalo en el contexto de lo que venían charlando.
`;

router.post('/ask', async (req, res) => {
  try {
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
    
    const reglamentoText = readTextFile(reglamentoFile, 'No hay reglamento cargado actualmente.');
    const today = new Date().toISOString().slice(0, 10);

    const activeReservations = Array.isArray(reservations) 
      ? reservations
          .filter(r => r && r.date >= today)
          .map(r => `Unidad: "${r.unit_id}" | Fecha: ${r.date} | Turno: ${r.turno} | Nombre: ${r.nombre || ''} ${r.apellido || ''}`)
      : [];

    const contextData = `
¡ATENCIÓN! ESTOS SON LOS LÍMITES ACTUALES VIGENTES EN EL CONFIG.JSON (¡USAR ESTOS Y NO OTROS!):
- Máximo de reservas permitidas por semana: ${buildingConfig.max_reservas_semana}
- Máximo de reservas permitidas por mes: ${buildingConfig.max_reservas_mes}
- Anticipación máxima permitida: ${buildingConfig.dias_anticipacion_max} días desde hoy.
- Días bloqueados por mantenimiento o eventos de la administración: ${JSON.stringify(blockedDays)}
- Próximas reservas registradas en todo el edificio: 
${activeReservations.length > 0 ? activeReservations.join('\n') : 'Ninguna próxima registrada'}

---
REGLAMENTO OFICIAL DEL EDIFICIO (SUM Y PILETA):
${reglamentoText}
`;

    let messages = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + contextData }
    ];

    if (Array.isArray(history) && history.length > 0) {
      messages.push(...history);
    }

    messages.push({ role: "user", content: message.trim() });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.3,
      max_tokens: 500
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
