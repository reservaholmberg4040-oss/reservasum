// Base de datos simple en archivo JSON (sin dependencias nativas -> despliega en cualquier hosting sin compilar nada).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Definimos las rutas de los archivos de datos
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json'); // Reservas
const unitsFile = path.join(dataDir, 'units.json'); // Unidades

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
    // Aseguramos que el directorio exista antes de escribir (por seguridad)
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error escribiendo en ${file}:`, e);
    throw e; // Lanzamos el error para que el backend lo maneje
  }
}

// Estado inicial de la base de datos
let dbData = {
  reservations: readJson(dbFile, []),
  units: readJson(unitsFile, []),
  admin: [
    // Usuario: admin, Contraseña: admin123 (puedes cambiarlo en el archivo db.json luego del primer inicio)
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
      // Al obtener todas, nos aseguramos de que el campo 'baja' exista (para unidades viejas)
      return dbData.units.map(u => ({
        baja: false, // Valor por defecto si no existe
        ...u
      }));
    },
    // Busca una unidad por su ID o número de unidad
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
        return u;
      }
      return null;
    },
    regeneratePin(id) {
      const u = this.byId(id);
      if (u) {
        u.pin = Math.floor(1000 + Math.random() * 9000).toString();
        writeJson(unitsFile, dbData.units);
        return u;
      }
      return null;
    },
    setPropietario(id, propietario) {
      const u = this.byId(id);
      if (u) {
        u.propietario = propietario;
        writeJson(unitsFile, dbData.units);
        return u;
      }
      return null;
    },
    // --- NUEVA FUNCIÓN: Marcar/Desmarcar BAJA ---
    setBaja(id, estadoBaja) {
      const u = this.byId(id);
      if (u) {
        u.baja = estadoBaja === true; // Nos aseguramos que sea booleano
        writeJson(unitsFile, dbData.units);
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
      // Nota: El historial de reportes no se persiste en archivo en esta versión simple, solo en memoria.
    }
  }
};

module.exports = db;
