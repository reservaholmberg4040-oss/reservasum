const nodemailer = require('nodemailer');
const cron = require('node-cron');
const db = require('../db');
const { buildMonthlyReport } = require('./report');

function getTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

async function sendMonthlyReport(period, recipientOverride) {
  const transport = getTransport();
  const recipient = recipientOverride || process.env.REPORT_RECIPIENT;
  if (!transport || !recipient) {
    throw new Error('Falta configurar SMTP_USER/SMTP_PASSWORD/REPORT_RECIPIENT en las variables de entorno.');
  }

  const { buffer, filename, totalsByUnit } = buildMonthlyReport(period);

  const totalsHtml = totalsByUnit.map(t =>
    `<tr><td>${t.unidad}</td><td>${t.piso} ${t.dto}</td><td>${t.propietario}</td><td style="text-align:center">${t.turnos_dia}</td><td style="text-align:center">${t.turnos_noche}</td><td style="text-align:center"><b>${t.total_turnos}</b></td><td>${t.fechas.join('<br>')}</td></tr>`
  ).join('');

  const html = `
    <h2>Informe mensual de reservas del SUM — Holmberg 4040</h2>
    <p>Período: <b>${period}</b></p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead style="background:#f0f0f0"><tr><th>Unidad</th><th>Piso/Dto</th><th>Propietario</th><th>Turnos Día</th><th>Turnos Noche</th><th>Total</th><th>Días reservados</th></tr></thead>
      <tbody>${totalsHtml || '<tr><td colspan="7">Sin reservas en este período.</td></tr>'}</tbody>
    </table>
    <p>Se adjunta el informe completo en Excel con el detalle de cada reserva.</p>
  `;

  await transport.sendMail({
    from: `"SUM Holmberg 4040" <${process.env.SMTP_USER}>`,
    to: recipient,
    subject: `Informe de reservas SUM Holmberg 4040 - ${period}`,
    html,
    attachments: [{ filename, content: buffer }]
  });

  db.reportLog.add({ period, sent_at: new Date().toISOString(), recipient, status: 'enviado' });
}

/**
 * Envía un correo de confirmación al propietario cuando reserva el SUM
 */
async function sendReservationConfirmation(recipientEmail, reservationDetails) {
  const transport = getTransport();
  if (!transport || !recipientEmail) return;

  const { date, turno, unidad, piso, dto, propietario } = reservationDetails;
  const turnoLabel = String(turno).toLowerCase().includes('dia') || String(turno).toLowerCase().includes('día') ? 'Día' : 'Noche';
  const pisoDtoStr = piso && dto ? `${piso} ${dto}` : (piso || dto || '');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Reserva de SUM Confirmada</h2>
      <p>Hola <strong>${propietario || 'Propietario'}</strong>,</p>
      <p>Te confirmamos que se ha registrado con éxito una reserva para el SUM de Holmberg 4040.</p>
      
      <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
        <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> ${date}</p>
        <p style="margin: 6px 0;">⏰ <strong>Turno:</strong> ${turnoLabel}</p>
        <p style="margin: 6px 0;">🏠 <strong>Unidad:</strong> ${unidad} ${pisoDtoStr ? `(Piso/Dto: ${pisoDtoStr})` : ''}</p>
      </div>
      
      <p style="font-size: 13px; color: #6b7280;">Si necesitás modificar o cancelar tu turno, podés hacerlo ingresando al sistema con el PIN de tu unidad.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="font-size: 12px; color: #9ca3af; text-align: center;">Administración — SUM Holmberg 4040</p>
    </div>
  `;

  await transport.sendMail({
    from: `"SUM Holmberg 4040" <${process.env.SMTP_USER}>`,
    to: recipientEmail,
    subject: `Confirmación de reserva SUM - ${date} (${turnoLabel})`,
    html
  });
}

function previousMonthPeriod() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function scheduleMonthlyReport() {
  const day = Number(process.env.REPORT_DAY_OF_MONTH || 1);
  cron.schedule(`0 8 * * *`, async () => {
    const now = new Date();
    if (now.getDate() !== day) return;
    const period = previousMonthPeriod();
    try {
      await sendMonthlyReport(period);
      console.log(`[mailer] Informe de ${period} enviado correctamente.`);
    } catch (err) {
      console.error('[mailer] Error enviando informe mensual:', err.message);
      db.reportLog.add({ period, sent_at: new Date().toISOString(), recipient: process.env.REPORT_RECIPIENT || '', status: `error: ${err.message}` });
    }
  });
  console.log(`[mailer] Envío automático programado: día ${day} de cada mes, 08:00.`);
}

module.exports = { sendMonthlyReport, scheduleMonthlyReport, previousMonthPeriod, sendReservationConfirmation };
