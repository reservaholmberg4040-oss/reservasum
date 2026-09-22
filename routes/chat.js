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
const waitingFile = path.join(__dirname, '../data/waiting-list.json');

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
    *   Si el usuario realiza una consulta sobre sus reservas propias (historial o futuras) O expresa intención de realizar una nueva reserva o anotarse en lista de espera, **debes solicitar amablemente su identificación (número de unidad o piso y departamento, ej. "1° A") y su PIN**, si es que estos datos no han sido proporcionados previamente.

2.  **VALIDACIÓN ESTRICTA DE NUEVAS RESERVAS (REGLAS DE SISTEMA):**
    *   Compara siempre la fecha solicitada por el usuario con la fecha actual del sistema (variable 'today').
    *   **Anticipación Máxima:** Si la fecha elegida supera la "Anticipación máxima permitida", rechaza e indica la fecha exacta de habilitación.
    *   **Anticipación Mínima:** Si la regla indica que no se puede para hoy, rechaza e indica la fecha de mañana calculada.
    *   Respeta los límites de max_reservas_semana y max_reservas_mes provistos en la configuración.

3.  **CONSULTA DE DISPONIBILIDAD Y LISTA DE ESPERA (CRÍTICO):**
    *   Cuando un usuario pregunte por la disponibilidad de un día y turno específico (ej. "22/9 día?"), **debes consultar EXHAUSTIVAMENTE el "Listado general de reservas futuras" provisto en el contexto**.
    *   **DEDUCCIÓN LÓGICA OBLIGATORIA:** Si en el listado NO aparece ninguna reserva para la FECHA y TURNO específicos, **DEBES RESPONDER CLARAMENTE QUE ESTÁ DISPONIBLE**.
    *   **SI EL TURNO ESTÁ OCUPADO:** 
        - Infórmale amablemente que ya se encuentra reservado.
        - **Ofrécele inmediatamente la posibilidad de sumarse a la Lista de Espera** para esa fecha y turno.
        - Explícale la dinámica claramente: si el propietario actual cancela, el sistema le enviará un **correo electrónico automático** al instante avisando que quedó libre. Al liberarse, queda disponible **por estricto orden de llegada**, por lo que deberá ingresar rápido a tomarlo antes de que otro vecino lo reserve.
        - Indícale que para anotarse debe proporcionarte su unidad y su PIN.

4.  **REGLAMENTO Y DÍAS BLOQUEADOS:**
    *   Responde dudas basándote en el reglamento provisto.
    *   Si coincide con días bloqueados, informa que no está disponible.

5.  **SEGURIDAD:**
    *   NUNCA reveles PINs de acceso a las unidades.
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
    const waitingList = readJsonFile(waitingFile, []);
    
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

    const activeWaiting = Array.isArray(waitingList)
      ? waitingList
          .filter(w => w && w.date >= today)
          .map(w => `Unidad en espera: "${w.unit_id}" | Fecha: ${w.date} | Turno: ${w.turno}`)
      : [];

    const contextData = `
CONFIGURACIÓN VIGENTE EN EL SISTEMA (USAR ESTOS VALORES EXACTOS):
- Máximo de reservas permitidas por semana: ${buildingConfig.max_reservas_semana}
- Máximo de reservas permitidas por mes: ${buildingConfig.max_reservas_mes}
- Anticipación máxima permitida: ${buildingConfig.dias_anticipacion_max} días desde hoy.
- Anticipación mínima permitida: ${buildingConfig.dias_anticipacion_min} día(s).
- Días bloqueados por administración: ${JSON.stringify(blockedDays)}
- Listado general de reservas futuras en el edificio: 
${activeReservations.length > 0 ? activeReservations.join('\n') : 'Ninguna reserva futura registrada en el edificio'}
- Listado actual de personas en Lista de Espera:
${activeWaiting.length > 0 ? activeWaiting.join('\n') : 'Ninguna persona en lista de espera actualmente'}

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
