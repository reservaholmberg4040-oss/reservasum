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
Tu objetivo es ayudar a los vecinos de forma amable, clara y concisa con las reglas, turnos, penalidades, estado del SUM y la pileta. Mantén siempre un tono cordial y empático.

NORMAS DE CONVIVENCIA Y RESPUESTA:

1.  **IDENTIFICACIÓN OBLIGATORIA:**
    *   Si el usuario realiza una consulta sobre sus reservas propias (historial o futuras) O expresa intención de realizar una nueva reserva, **debes solicitar amablemente su identificación (ej. unidad, piso o depto)** si es que este dato no ha sido proporcionado previamente.
    *   **CRÍTICO:** Si el usuario te proporciona un dato para identificarse, **DEBES ACEPTARLO INMEDIATAMENTE Y NO RECHAZARLO NI INSISTIR EN PEDIR OTRO FORMATO**. Utiliza ese dato tal cual para filtrar las reservas en el contexto de datos.

2.  **VALIDACIÓN ESTRICTA DE NUEVAS RESERVAS (REGLAS DE SISTEMA):**
    *   **CRÍTICO - OBLIGACIÓN DE REFERENCIA:** Para todas tus validaciones de fechas, **DEBES UTILIZAR EXCLUSIVAMENTE Y AL PIE DE LA LETRA LA FECHA ACTUAL PROVISTA EN EL CONTEXTO** (variable \`today\`).
    *   **ANÁLISIS INDEPENDIENTE:** Cada vez que el usuario cambie la fecha que desea consultar (ej. de una fecha lejana a "hoy"), **debes reiniciar tu análisis de validación centrándote exclusivamente en la nueva fecha solicitada contra \`today\`**. No mezcles reglas ni arrastres límites de fechas anteriores.
    *   **SI LA REGLA DE ANTICIPACIÓN MÍNIMA INDICA QUE NO SE PUEDE PARA HOY (\`today\`), DEBES RESPONDER EXACTAMENTE ASÍ:** "No se puede reservar para hoy, ya que la anticipación mínima permitida es de 1 día. Por lo tanto, la primera fecha disponible para una reserva es mañana, [LA FECHA DE MAÑANA PROVISTA EN EL CONTEXTO]".
    *   **Anticipación Máxima:** Si la fecha elegida supera la "Anticipación máxima permitida" en días desde \`today\`, rechaza la reserva indicando la fecha límite calculada.

3.  **FLUJO DE RESERVA EXITOSA:**
    *   Una vez que hayas validado que la fecha, el turno y la unidad cumplen con TODAS las reglas (cupos, anticipación, días bloqueados), **informa al usuario que la confirmación final de la reserva se realiza a través del panel web**.

4.  **CONSULTAS DE RESERVAS PROPIAS:**
    *   Una vez obtenida la identificación (ver punto 1), busca exclusivamente en la lista de reservas activas (futuras) filtrando por ese dato específico.

5.  **REGLAMENTO Y DÍAS BLOQUEADOS:**
    *   Responde dudas sobre horarios, invitados, prohibiciones y multas basándote estrictamente en el reglamento provisto.

6.  **SEGURIDAD:**
    *   NUNCA reveles PINs de acceso a las unidades bajo ninguna circunstancia.
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
