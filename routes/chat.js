const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const db = require('../db'); // Importamos la base de datos para validar PIN

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

// --- FUNCIÓN AUXILIAR DE VALIDACIÓN DE PIN (Backend) ---
// Extraída y adaptada de routes/reservations.js para ser usada por la IA
function validarUnidadYPin(unit_id, unit_pin) {
  try {
    const units = db.units.all();
    const targetUnit = Array.isArray(units) ? units.find(u => {
      if (!u) return false;
      const uId = String(u.id || '').trim();
      const uUnidad = String(u.unidad || '').trim();
      const target = String(unit_id).trim();
      return uId === target || uUnidad === target;
    }) : null;

    if (!targetUnit) {
      return { success: false, error: 'Unidad no encontrada.' };
    }

    const storedPin = String(targetUnit.pin || '').trim();
    const providedPin = String(unit_pin || '').trim();

    if (!storedPin) {
      return { success: false, error: 'Esta unidad no tiene un PIN configurado.' };
    }

    if (!providedPin || storedPin !== providedPin) {
      return { success: false, error: 'El PIN ingresado es incorrecto.' };
    }

    return { success: true, unitData: targetUnit };
  } catch (err) {
    console.error('Error validando PIN:', err);
    return { success: false, error: 'Error interno al validar credenciales.' };
  }
}

// --- HERRAMIENTA 1: Función real que la IA ejecutará para anotarse en la lista ---
async function _tool_anotarEnListaEspera(args) {
    const { fecha, turno, unidad, pin } = args;
    console.log(`[IA Tool] Solicitud de lista de espera: Fecha ${fecha}, Turno ${turno}, Unidad ${unidad}`);

    // 1. Validar identidad
    const validacion = validarUnidadYPin(unidad, pin);
    if (!validacion.success) {
        return JSON.stringify({ error: validacion.error });
    }

    const targetUnit = validacion.unitData;
    const unitIdentifier = String(targetUnit.unidad || targetUnit.id).trim();

    // 2. Leer y actualizar lista de espera
    let waitingList = readJsonFile(waitingFile, []);
    
    // Normalizar para evitar duplicados exactos
    const norm = (str) => String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const exists = Some(waitingList.some(item => 
        String(item.unit_id) === unitIdentifier && 
        String(item.date) === String(fecha).trim() && 
        norm(item.turno) === norm(turno)
    ));

    if (exists) {
        return JSON.stringify({ error: 'Ya te encuentras en la lista de espera para este turno.' });
    }

    const newEntry = {
        id: Date.now().toString(),
        unit_id: unitIdentifier,
        propietario: String(targetUnit.propietario || ''),
        date: String(fecha).trim(),
        turno: String(turno).trim(),
        createdAt: new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T') + '-03:00'
    };

    waitingList.push(newEntry);
    try {
        fs.writeFileSync(waitingFile, JSON.stringify(waitingList, null, 2), 'utf8');
        db.auditLogs.add('LISTA_ESPERA_AGREGADA_IA', `Unidad ${unitIdentifier} se anotó a la espera vía Chat IA para el ${fecha} (${turno})`, `Unidad ${unitIdentifier}`);
        return JSON.stringify({ success: true, message: 'Te has anotado en la lista de espera correctamente. Te avisaremos si el turno se libera.' });
    } catch (writeErr) {
        console.error('Error escribiendo waiting-list.json desde IA:', writeErr);
        return JSON.stringify({ error: 'Error interno al guardar en la lista de espera.' });
    }
}

// Mapa de herramientas disponibles para la IA
const availableTools = {
    anotar_en_lista_espera: _tool_anotarEnListaEspera
};


const SYSTEM_PROMPT = `
Sos "HolmIA", el asistente virtual oficial del SUM y del edificio Holmberg 4040.
Tu objetivo es ayudar a los vecinos de forma amable, clara y concisa con las reglas, turnos, penalidades, estado del SUM y la pileta. Mantén siempre un tono cordial y empático.

NORMAS DE CONVIVENCIA Y RESPUESTA:

1.  **IDENTIFICACIÓN OBLIGATORIA:**
    *   Si el usuario realiza una consulta sobre sus reservas propias (historial o futuras) O expresa intención de realizar una nueva reserva, cancelar, O anotarse en lista de espera, **debes solicitar amablemente su identificación (número de unidad o piso y departamento, ej. "1° A")**, si es que este dato no ha sido proporcionado previamente.

2.  **CONSULTA DE DISPONIBILIDAD (CRÍTICO):**
    *   Cuando un usuario pregunte por la disponibilidad de un día y turno específico (ej. "22/9 día?"), **debes consultar EXHAUSTIVAMENTE el "Listado general de reservas futuras" provisto en el contexto**.
    *   Si en el listado NO aparece ninguna reserva para la FECHA y TURNO específicos, **DEBES RESPONDER CLARAMENTE QUE ESTÁ DISPONIBLE**.

3.  **LISTA DE ESPERA (AUTOMATIZADA):**
    *   **SI EL TURNO ESTÁ OCUPADO:**
        - Informa amablemente que ya se encuentra reservado.
        - **Ofrécele sumarse a la Lista de Espera** para esa fecha y turno.
        - Explícale la dinámica: si el propietario cancela, el sistema enviará un correo automático avisando que quedó libre. Al liberarse, queda disponible por orden de llegada (deberá ingresar rápido a tomarlo).
        - **IMPORTANTE:** Si el usuario acepta anotarse, **DEBES utilizar la herramienta \`anotar_en_lista_espera\`**. Para ello, pídele amablemente su número de **Unidad** y su **PIN** (contraseña numérica). Una vez que te los dé, invoca la herramienta con los parámetros correctos (fecha en formato YYYY-MM-DD).
        - NUNCA digas "no puedo anotarte". Ahora SÍ puedes mediante la herramienta.

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
      console.error('[ERROR CHAT]: Falta configurar OPENAI_API_KEY');
      return res.status(500).json({ success: false, error: 'El asistente no está configurado.' });
    }

    const reservations = readJsonFile(reservationsFile, []);
    const blockedDays = readJsonFile(blockedDaysFile, []);
    const buildingConfig = readJsonFile(configFile, { max_reservas_mes: 4, max_reservas_semana: 1, dias_anticipacion_max: 60, dias_anticipacion_min: 0 });
    
    const reglamentoText = readTextFile(reglamentoFile, 'No hay reglamento cargado.');
    const today = new Date().toISOString().slice(0, 10);

    // Contexto de datos para la IA
    const activeReservations = Array.isArray(reservations) 
      ? reservations
          .filter(r => r && r.date >= today)
          .map(r => `Unidad: "${r.unit_id}" | Fecha: ${r.date} | Turno: ${r.turno}`)
      : [];

    const contextData = `
CONFIGURACIÓN VIGENTE (USAR ESTOS VALORES EXACTOS):
- Máximo de reservas permitidas por semana: ${buildingConfig.max_reservas_semana}
- Máximo de reservas permitidas por mes: ${buildingConfig.max_reservas_mes}
- Anticipación máxima permitida: ${buildingConfig.dias_anticipacion_max} días desde hoy.
- Anticipación mínima permitida: ${buildingConfig.dias_anticipacion_min} día(s).
- Días bloqueados por administración: ${JSON.stringify(blockedDays)}
- Listado general de reservas futuras: 
${activeReservations.length > 0 ? activeReservations.join('\n') : 'Ninguna reserva futura registrada'}

---
REGLAMENTO OFICIAL:
${reglamentoText}
`;

    let messages = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + contextData }
    ];

    // Añadir historial si existe
    if (Array.isArray(history) && history.length > 0) {
      messages.push(...history);
    }
    
    // Si el frontend envía contexto específico de fecha/turno de la interfaz, lo inyectamos al usuario
    let userMessage = message.trim();
    if (dateContext && turnoContext) {
        userMessage = `${userMessage} (El usuario está consultando específicamente sobre el turno del ${dateContext} por la ${turnoContext})`;
    }

    messages.push({ role: "user", content: userMessage });

    // --- CONFIGURACIÓN DE HERRAMIENTAS (Tools) ---
    const tools = [
        {
            type: "function",
            function: {
                name: "anotar_en_lista_espera",
                description: "Anota una unidad en la lista de espera para una fecha y turno específicos si el turno ya está ocupado.",
                parameters: {
                    type: "object",
                    properties: {
                        fecha: { type: "string", description: "La fecha del turno en formato YYYY-MM-DD (ej. 2026-09-22)." },
                        turno: { type: "string", description: "El turno del día, ya sea 'dia' o 'noche'." },
                        unidad: { type: "string", description: "El número de unidad o piso y departamento del vecino (ej. 0002 o 1° A)." },
                        pin: { type: "string", description: "El PIN numérico de seguridad de la unidad." }
                    },
                    required: ["fecha", "turno", "unidad", "pin"]
                }
            }
        }
    ];

    // Llamada inicial a OpenAI con las herramientas definidas
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // O "gpt-4o" si lo prefieres
      messages: messages,
      tools: tools,
      tool_choice: "auto", // La IA decide si usar la herramienta o responder texto
      temperature: 0.2,
      max_tokens: 400
    });

    const responseMessage = completion.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    // --- PASO 2: Si la IA decide llamar a la herramienta ---
    if (toolCalls) {
        // Añadimos el mensaje de la IA al historial
        messages.push(responseMessage);

        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionToCall = availableTools[functionName];
            const functionArgs = JSON.parse(toolCall.function.arguments);

            if (functionToCall) {
                // Ejecutamos la función real en el backend
                const toolOutput = await functionToCall(functionArgs);

                // Añadimos el resultado de la ejecución al historial
                messages.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: toolOutput,
                });
            }
        }

        // Llamamos a OpenAI nuevamente para que nos dé la respuesta final en texto
        const secondResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.2,
        });

        const finalReply = secondResponse.choices[0].message.content;
        res.json({ success: true, reply: finalReply });

    } else {
        // --- PASO 3: Si la IA responde con texto normal ---
        const reply = responseMessage.content;
        res.json({ success: true, reply });
    }

  } catch (err) {
    console.error('Error detallado en el asistente de chat IA:', err);
    res.status(500).json({ 
      success: false,
      error: 'Lo siento, en este momento el asistente virtual no está disponible. Intentá más tarde.' 
    });
  }
});

module.exports = router;
