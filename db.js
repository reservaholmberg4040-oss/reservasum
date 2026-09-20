// Base de datos simple en archivo JSON (sin dependencias nativas -> despliega en cualquier hosting sin compilar nada).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Definimos las rutas de los archivos de datos
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json'); // Reservas
const unitsFile = path.join(dataDir, 'units.json'); // Unidades
const auditFile = path.join(dataDir, 'audit-logs.json'); // Logs de Auditoría

// Asegurar que exista la carpeta data
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.error('No se pudo crear la carpeta data:', e);
  }
}

// Funciones auxiliares de lectura/escritura JSON
function readJson(file, defaultVal) {
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`Error leyendo ${file}:`, e);
  }
  return defaultVal;
}

function writeJson(file, data) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error escribiendo en ${file}:`, e);
    throw e;
  }
}

// Estado inicial de la base de datos
let dbData = {
  reservations: readJson(dbFile, []),
  units: readJson(unitsFile, []),
  admin: [
    { username: 'admin', password_hash: bcrypt.hashSync('admin123', 8) }
  ],
  reportLog: []
};

// Objeto principal de la base de datos
const db = {
  reservations: {
    all() {
      return dbData.reservations;
    },
    add(reservation) {
      if (!reservation.id) {
        reservation.id = Date.now().toString();
      }
      dbData.reservations.push(reservation);
      writeJson(dbFile, dbData.reservations);
      return reservation;
    },
    saveAll(list) {
      dbData.reservations = list;
      writeJson(dbFile, dbData.reservations);
    },
    distinctPeriods() {
      const periods = new Set();
      dbData.reservations.forEach(r => {
        if (r.date) periods.add(r.date.slice(0, 7));
      });
      return Array.from(periods).sort().reverse();
    }
  },
  units: {
    all() {
      return dbData.units.map(u => ({
        baja: false,
        ...u
      }));
    },
    byId(id) {
      return dbData.units.find(x => String(x.id) === String(id) || String(x.unidad) === String(id));
    },
    saveAll(list) {
      dbData.units = list;
      writeJson(unitsFile, dbData.units);
    },
    setPin(id, pin) {
      const u = this.byId(id);
      if (u) {
        u.pin = pin;
        writeJson(unitsFile, dbData.units);
        db.auditLogs.add('CAMBIO_PIN', `Se actualizó el PIN de la unidad ${u.unidad || id}`);
        return u;
      }
      return null;
    },
    regeneratePin(id) {
      const u = this.byId(id);
      if (u) {
        u.pin = Math.floor(1000 + Math.random() * 9000).toString();
        writeJson(unitsFile, dbData.units);
        db.auditLogs.add('REGENERAR_PIN', `Se regeneró el PIN de la unidad ${u.unidad || id}`);
        return u;
      }
      return null;
    },
    setPropietario(id, propietario) {
      const u = this.byId(id);
      if (u) {
        u.propietario = propietario;
        writeJson(unitsFile, dbData.units);
        db.auditLogs.add('CAMBIO_PROPIETARIO', `Se actualizó el propietario de la unidad ${u.unidad || id} a: ${propietario}`);
        return u;
      }
      return null;
    },
    setEmail(id, email) {
      const u = this.byId(id);
      if (u) {
        u.email = email ? String(email).trim() : '';
        writeJson(unitsFile, dbData.units);
        db.auditLogs.add('CAMBIO_EMAIL', `Se actualizó el correo de la unidad ${u.unidad || id}`);
        return u;
      }
      return null;
    },
    setBaja(id, estadoBaja) {
      const u = this.byId(id);
      if (u) {
        u.baja = estadoBaja === true;
        writeJson(unitsFile, dbData.units);
        db.auditLogs.add('ESTADO_BAJA', `Se cambió el estado de baja de la unidad ${u.unidad || id} a: ${u.baja}`);
        return u;
      }
      return null;
    }
  },
  admin: {
    byUsername(username) {
      return dbData.admin.find(a => a.username === username);
    }
  },
  reportLog: {
    all() {
      return dbData.reportLog || [];
    },
    add(log) {
      dbData.reportLog = dbData.reportLog || [];
      dbData.reportLog.push(log);
    }
  },
  auditLogs: {
    all() {
      return readJson(auditFile, []);
    },
    add(action, details, user = 'Sistema') {
      try {
        let logs = readJson(auditFile, []);
        const newLog = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
          timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T') + '-03:00',
          user: String(user),
          action: String(action),
          details: String(details)
        };
        logs.unshift.call(logs, newLog); // Agregar al principio

        // Límite de 1000 registros (eliminar más antiguos si supera el tope)
        if (logs.length > 1000) {
          logs = logs.slice(0, 1000);
        }

        writeJson(auditFile, logs);
      } catch (err) {
        console.error('Error al registrar log de auditoría:', err);
      }
    }
  }
};

module.exports = db;
