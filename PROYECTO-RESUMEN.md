# SUM Holmberg 4040 — Resumen del proyecto (para retomarlo después)

## Qué es
Web de reservas del SUM del edificio Holmberg 4040. Turno día / turno noche, calendario anual público, y un panel de administración para cobrar expensas y mandar informes por mail.

## Dónde vive
- **Código:** repositorio de GitHub (el que creaste con GitHub Desktop). Anotá acá la URL: `_______________`
- **Deploy:** Render, servicio `holmberg-4040-sum`, plan Starter (necesario para el disco persistente y para que el envío de mail por SMTP no quede bloqueado).
- **Disco persistente:** montado en `/var/data`, con `DB_PATH=/var/data/db.json` — ahí se guardan todas las reservas y los PINs. No se pierde entre deploys.
- **URL pública:** la que te dio Render (tipo `https://holmberg-4040-sum.onrender.com`).

## Cómo se actualiza
1. Editás el código localmente (o pedís los cambios en el chat de Claude).
2. Copiás los archivos actualizados sobre la carpeta local que tiene GitHub Desktop.
3. GitHub Desktop: Commit → Push origin.
4. Render redeploya solo (`autoDeploy: true`).

## Decisiones clave de diseño
- **Base de datos:** archivo JSON plano (`db.js`), sin dependencias nativas, para que corra en cualquier hosting sin compilar nada.
- **Unidades:** las 28 unidades reales (piso, dto, propietario) están en `data/units.json`, extraídas de las expensas. Si cambia un propietario, se edita ese archivo (no pisa unidades ya cargadas en la base).
- **Sistema de PIN por unidad:** cada unidad tiene un PIN de 4 dígitos (generado al azar inicialmente). Se usa para:
  - Crear una reserva (evita que alguien reserve "en nombre" de otra unidad).
  - Editar o cancelar una reserva, desde cualquier dispositivo (no depende del navegador que la creó).
  - El administrador puede ver, cambiar o regenerar el PIN de cada unidad desde `/admin` (tabla "PINs de unidades").
  - **El admin (con sesión iniciada) puede crear/editar/cancelar cualquier reserva sin necesitar el PIN** — es la excepción intencional para poder corregir cosas a mano.
- **Calendario:** siempre público y visible para cualquiera que entre (transparencia total), aunque no esté logueado.
- **Fechas pasadas:** no se puede reservar ni mover una reserva a una fecha que ya pasó (salvo el admin, para cargar algo retroactivo).
- **Informe mensual:** se arma en Excel (resumen por unidad + detalle con fechas) y se manda automáticamente el día configurado (`REPORT_DAY_OF_MONTH`, por defecto el 1) a las 8:00 UTC (5 AM Argentina) al mail de `REPORT_RECIPIENT`. También se puede mandar manualmente desde el dashboard.

## Variables de entorno (configuradas en Render → Environment)
- `ADMIN_USER` / `ADMIN_PASSWORD` — login de `/admin`.
- `SMTP_USER` / `SMTP_PASSWORD` (contraseña de aplicación de Gmail) / `REPORT_RECIPIENT` — envío de mail.
- `DB_PATH=/var/data/db.json` — ubicación de los datos en el disco persistente.
- `SESSION_SECRET` — clave para las cookies de sesión del admin.
- `BUILDING_NAME`, `REPORT_DAY_OF_MONTH` — opcionales, ya tienen valores por defecto razonables.

## Problemas ya resueltos (por si vuelven a aparecer)
- Render bloquea los puertos SMTP en el plan Free → hace falta plan Starter para que funcione el envío de mail.
- Los discos persistentes tampoco están disponibles en el plan Free → mismo motivo, Starter es necesario.
- Si estás logueado como admin en el mismo navegador donde probás la web pública, el sistema te reconoce como admin y salteá la validación de PIN (es esperado, no es un bug) — para probar como un vecino común, hacelo en una ventana de incógnito o cerrando sesión de admin.
