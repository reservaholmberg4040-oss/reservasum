# SUM Holmberg 4040 — Sistema de reservas

Web para gestionar las reservas del SUM (turno día / turno noche) del edificio Holmberg 4040.

## Qué incluye

- Calendario anual público: cualquiera que entra ve quién reservó cada turno (transparencia total).
- Reserva de turno eligiendo la unidad (ya cargadas las 28 unidades reales del edificio, extraídas de las expensas) y nombre/apellido.
- Si el turno ya está ocupado, avisa y no permite duplicar.
- Cada vecino puede editar o cancelar **sus propias** reservas (se identifican automáticamente desde su navegador).
- Nadie más que el administrador puede modificar reservas ajenas.
- Panel de administrador (`/admin`) con usuario y contraseña:
  - Dashboard con el resumen de turnos usados por unidad y por mes, para cobrar en las expensas.
  - Descarga de informe en Excel (resumen + detalle).
  - Envío del informe por mail (manual o automático todos los meses).
  - Historial de envíos.

## 1. Requisitos previos

- Node.js 18 o superior.
- Una cuenta de Gmail (u otro proveedor SMTP) para el envío automático de mails.

## 2. Configuración local

```bash
npm install
cp .env.example .env
```

Editá `.env` y completá (ver detalle de cada variable más abajo):

- `ADMIN_USER` / `ADMIN_PASSWORD`: para entrar a `/admin`.
- `SMTP_USER` / `SMTP_PASSWORD`: cuenta que envía el informe mensual.
- `REPORT_RECIPIENT`: mail que lo recibe.
- `SESSION_SECRET`: cualquier texto largo y random.

Después corré:

```bash
npm start
```

Y entrá a `http://localhost:3000` (calendario público) y `http://localhost:3000/admin` (panel admin).

### Cómo generar la "contraseña de aplicación" de Gmail (para SMTP_PASSWORD)

Gmail no permite usar la contraseña normal de la cuenta para enviar mails desde una app. Hay que generar una "contraseña de aplicación":

1. Activá la verificación en 2 pasos en la cuenta de Gmail que vas a usar para enviar (Configuración de Google → Seguridad).
2. Andá a https://myaccount.google.com/apppasswords
3. Generá una contraseña nueva (elegí "Otra" y poné un nombre, ej: "SUM Holmberg").
4. Copiá el código de 16 letras que te da Google y pegalo en `SMTP_PASSWORD` (sin espacios).

## 3. Desplegar online con URL pública (Render)

Uso Render porque tiene un plan simple y económico, soporta Node.js sin configuración especial, y permite variables de entorno + disco persistente para no perder los datos.

### Paso a paso

1. **Subí el proyecto a GitHub** (si no tenés cuenta, creá una gratis en github.com):
   ```bash
   cd holmberg-sum
   git init
   git add .
   git commit -m "SUM Holmberg 4040"
   ```
   Creá un repositorio nuevo en GitHub (botón "New repository", puede ser privado) y seguí las instrucciones que te da GitHub para conectarlo y hacer push (algo como):
   ```bash
   git remote add origin https://github.com/TU-USUARIO/holmberg-sum.git
   git branch -M main
   git push -u origin main
   ```

2. **Creá una cuenta en Render**: https://render.com (podés entrar directo con tu cuenta de GitHub).

3. **Nuevo Web Service**:
   - Dashboard de Render → "New +" → "Web Service".
   - Elegí el repositorio `holmberg-sum` que subiste.
   - Render va a detectar automáticamente el archivo `render.yaml` incluido en el proyecto y te va a proponer la configuración (plan "Starter", con disco persistente para no perder las reservas).
   - Si no lo detecta solo, configurá a mano:
     - Build Command: `npm install`
     - Start Command: `npm start`
     - Agregá un disco persistente (Disks → Add Disk) montado en `/var/data`, y una variable `DB_PATH=/var/data/db.json`.

4. **Completá las variables de entorno** (Environment → Add Environment Variable), las mismas que en tu `.env` local:
   - `ADMIN_USER`, `ADMIN_PASSWORD`
   - `SMTP_USER`, `SMTP_PASSWORD`, `REPORT_RECIPIENT`
   - `BUILDING_NAME` (opcional)

5. **Deploy**. Render te va a dar una URL pública tipo `https://holmberg-4040-sum.onrender.com` — esa es la que compartís con todos los vecinos.

### Sobre el plan gratuito

El plan free de Render no permite disco persistente: cada vez que se reinicia el servicio (lo cual pasa seguido en el plan free) **se pueden perder las reservas guardadas**. Para un sistema que se usa para cobrar expensas, recomiendo el plan "Starter" (pago, económico, con disco persistente) para no arriesgar los datos. Si preferís arrancar gratis para probar la interfaz, es una opción, pero no la recomiendo para uso real.

### Alternativas a Render

El proyecto es un Node.js estándar, así que también funciona en Railway, Fly.io, o cualquier VPS. La clave es siempre: configurar las mismas variables de entorno y, si es posible, un disco persistente para el archivo de datos (`data/db.json` o el que definas en `DB_PATH`).

## 4. Uso diario

- Los vecinos entran a la URL pública, ven el calendario, hacen click en un día, eligen turno día/noche libre, seleccionan su unidad y ponen nombre y apellido.
- Para editar o cancelar su reserva, van a la pestaña "Mis reservas" (funciona por navegador/dispositivo — si reservan desde el celular, tienen que cancelar desde el mismo celular, o pedirle al administrador que la borre).
- Vos como administrador entrás a `/admin`, ves el resumen del mes, descargás el Excel o lo mandás por mail.
- El primer día de cada mes a las 8 AM (configurable con `REPORT_DAY_OF_MONTH`), el sistema manda automáticamente el informe del mes anterior al mail configurado en `REPORT_RECIPIENT`.

## 5. Estructura del proyecto

```
server.js          → arranque del servidor
db.js               → base de datos (archivo JSON, sin dependencias nativas)
data/units.json     → las 28 unidades reales del edificio (podés editarlas acá)
routes/             → API (unidades, reservas, admin)
utils/report.js     → generación del Excel
utils/mailer.js      → envío de mail + tarea programada mensual
public/              → frontend (calendario, formularios, panel admin)
```

Si en algún momento cambian los propietarios de alguna unidad, se edita directamente `data/units.json` (solo afecta a unidades nuevas, no pisa las que ya existen en la base).
