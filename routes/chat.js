const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Inicializar OpenAI asegurando que tome la key del entorno
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
Tu objetivo es ayudar a los vecinos de forma amable, clara y concisa con las reglas, turnos, penalidades y estado del SUM y la pileta.

REGLAS ESTRICTAS DE RESPUESTA:
1. CONSULTAS DE RESERVAS PROPIAS: Si el usuario pregunta si tiene reservas hechas, busca exclusivamente en la lista de reservas activas filtrando por su unidad.
2. VALIDACIÓN DE NUEVAS RESERVAS (ANTICIPACIÓN Y LÍMITES): 
   - Compara siempre la fecha que pide el usuario con la fecha actual del sistema.
   - **Anticipación Máxima:** Si la fecha elegida supera la "Anticipación máxima permitida" en días desde hoy, **rechaza la reserva de forma categórica**. Explícale con claridad que aún no se habilitó la fecha y **calcula e indícale exactamente a partir de qué día o fecha sí estará permitido realizarla**. No le ofrezcas avanzar ni confirmar si está fuera de rango.
   - **Anticipación Mínima:** Si el valor es **0**, SÍ se puede reservar para el mismo día. Si es mayor a 0 (ej. 1), no se puede para hoy y explícalo basándote en ese número.
   - Respeta los límites de max_reservas_semana y max_reservas_mes.
3. REGLAMENTO Y NORMATIVA: Responde dudas sobre horarios, invitados, prohibiciones y multas basándote en el reglamento.
4. DÍAS BLOQUEADOS: Si la fecha solicitada está en la lista de días bloqueados, comunícale que no se puede por mantenimiento o eventos de la administración.
5. SEGURIDAD DE PINs: NUNCA reveles PINs de unidades.
`;

router.post('/ask', async (req, res) => {
  try {
    const { message, history } = req.body; 
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('[ERROR CHAT]: Falta configurar la variable de entorno OPENAI_API_KEY');
      return res.status(500).json({ 
        success: false, 
        error: 'El asistente no está configurado correctamente en el servidor (Falta API Key).' 
      });
    }

    const reservations = readJsonFile(reservationsFile, []);
    const blockedDays = readJsonFile(blockedDaysFile, []);
    const buildingConfig = readJsonFile(configFile, { 
      max_reservas_mes: 1, 
      max_reservas_semana: 1, 
      dias_anticipacion_max: 60, 
      dias_anticipacion_min: 1 
    });
    
    const reglamentoText = readTextFile(reglamentoFile, 'No hay reglamento cargado actualmente.');
    const today = new Date().toISOString().slice(0, 10);

    const activeReservations = Array.isArray(reservations) 
      ? reservations
          .filter(r => r && r.date >= today)
          .map(r => `Unidad: "${r.unit_id}" | Fecha: ${r.date} | Turno: ${r.turno} | Nombre: ${r.nombre || ''} ${r.apellido || ''}`)
      : [];

    const contextData = `
CONFIGURACIÓN VIGENTE EN EL SISTEMA (USAR ESTOS VALORES EXACTOS):
- Máximo de reservas permitidas por semana: ${buildingConfig.max_reservas_semana}
- Máximo de reservas permitidas por mes: ${buildingConfig.max_reservas_mes}
- Anticipación máxima permitida: ${buildingConfig.dias_anticipacion_max} días desde hoy.
- Anticipación mínima permitida: ${buildingConfig.dias_anticipacion_min} día(s) (Si es 1, no se puede reservar para el mismo día de hoy).
- Días bloqueados por administración: ${JSON.stringify(blockedDays)}
- Listado general de reservas futuras en el edificio (Usar SOLO para chequear si una unidad tiene reservas o si un turno está ocupado): 
${activeReservations.length > 0 ? activeReservations.join('\n') : 'Ninguna reserva futura registrada en el edificio'}

---
REGLAMENTO OFICIAL:
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
      temperature: 0.2,
      max_tokens: 400
    });

    const reply = completion.choices[0].message.content;
    res.json({ success: true, reply });

  } catch (err) {
    console.error('Error detallado en el asistente de chat IA:', err);
    res.status(500).json({ 
      success: false,
      error: 'Lo siento, en este momento el asistente virtual no está disponible. Intentá más tarde.' 
    });
  }
});

module.exports = router;
