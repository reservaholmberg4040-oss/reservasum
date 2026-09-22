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

1.  **IDENTIFICACIÓN OBLIGATORIA (Solo consultas sensibles):**
    *   Si el usuario realiza una consulta sobre sus reservas propias (historial o futuras), **debes solicitar amablemente su identificación (número de unidad o piso y departamento, ej. "1° A")** antes de procesar la información, si es que este dato no ha sido proporcionado previamente.

2.  **CONSULTA DE DISPONIBILIDAD (CRÍTICO):**
    *   Cuando un usuario pregunte por la disponibilidad de un día y turno específico (ej. "22/9 día?"), **debes consultar EXHAUSTIVAMENTE el "Listado general de reservas futuras" provisto en el contexto**.
    *   **DEDUCCIÓN LÓGICA OBLIGATORIA:** Si en el listado NO aparece ninguna reserva para la FECHA y TURNO específicos que consulta el usuario, **DEBES RESPONDER CLARAMENTE QUE ESTÁ DISPONIBLE**.

3.  **LISTA DE ESPERA (SOLO INFORMATIVA):**
    *   **SI EL TURNO ESTÁ OCUPADO:**
        - Infórmale amablemente que ya se encuentra reservado.
        - **NO INTENTES ANOTARLO VOS MISMO/A**. El asistente virtual no tiene permisos para realizar acciones de base de datos por seguridad.
        - **INDIKALE CÓMO HACERLO:** Explícale al vecino que debe dirigirse a la sección **"Calendario"** en el panel web, seleccionar el día ocupado y allí encontrará la opción **"🔔 Anotarme en la lista de espera"**.
        - **EXPLÍCALE LA DINÁMICA:** Aclárale que si el propietario actual cancela, el sistema le enviará un **correo electrónico automático** al instante avisándole que el turno quedó libre. Una vez recibido el aviso, deberá ingresar rápidamente a la plataforma para reservarlo por **orden de llegada**.

4.  **REGLAMENTO Y DÍAS BLOQUEADOS:**
    *   Responde dudas basándote en el reglamento provisto.
    *   Si coincide con días bloqueados, informa que no está disponible.

5.  **SEGURIDAD:**
    *   NUNCA reveles PINs de acceso a las unidades.
`;

router.post('/ask', async (req, res) => {
  try {
    const { message, history, dateContext, turnoContext } = req.body; 
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
      max_reservas_mes: 4, 
      max_reservas_semana: 1, 
      dias_anticipacion_max: 60, 
      dias_anticipacion_min: 0 
    });
    
    const reglamentoText = readTextFile(reglamentoFile, 'No hay reglamento cargado actualmente.');
    const today = new Date().toISOString().slice(0, 10);

    const activeReservations = Array.isArray(reservations) 
      ? reservations
          .filter(r => r && r.date >= today)
          .map(r => `Unidad: "${r.unit_id}" | Fecha: ${r.date} | Turno: ${r.turno}`)
      : [];

    const contextData = `
CONFIGURACIÓN VIGENTE EN EL SISTEMA (USAR ESTOS VALORES EXACTOS):
- Máximo de reservas permitidas por semana: ${buildingConfig.max_reservas_semana}
- Máximo de reservas permitidas por mes: ${buildingConfig.max_reservas_mes}
- Anticipación máxima permitida: ${buildingConfig.dias_anticipacion_max} días desde hoy.
- Anticipación mínima permitida: ${buildingConfig.dias_anticipacion_min} día(s).
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

    // Si el frontend envía contexto específico de fecha/turno de la interfaz, lo inyectamos al usuario
    let userMessage = message.trim();
    if (dateContext && turnoContext) {
        userMessage = `${userMessage} (El usuario está consultando específicamente sobre el turno del ${dateContext} por la ${turnoContext})`;
    }

    messages.push({ role: "user", content: userMessage });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // O "gpt-4o"
      messages: messages,
      temperature: 0.2,
      max_tokens: 400
    });

    const reply = completion.choices[0].message.content;
    res.json({ success: true, reply });

  } catch (err) {
    console.error('Detailed error in assistant chat IA:', err);
    res.status(500).json({ 
      success: false,
      error: 'Lo siento, en este momento el asistente virtual no está disponible. Intentá más tarde.' 
    });
  }
});

module.exports = router;
