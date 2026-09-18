// Base de datos simple en archivo JSON (sin dependencias nativas -> despliega en cualquier hosting sin compilar nada).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');
const unitsFile = path.join(dataDir, 'units.json');

// Asegurar que exista la carpeta data
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {}
}

function readJson(file, defaultVal) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return defaultVal;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

let dbData = {
  reservations: readJson(dbFile, []),
  units: readJson(unitsFile, []),
  admin: [
    { username: 'admin', password_hash: bcrypt.hashSync('admin123', 8) }
  ],
  reportLog: []
};

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
      return dbData.units;
    },
    saveAll(list) {
      dbData.units = list;
      writeJson(unitsFile, dbData.units);
    },
    save(list) {
      dbData.units = list;
      writeJson(unitsFile, dbData.units);
    },
    setPin(id, pin) {
      const u = dbData.units.find(x => String(x.id) === String(id) || String(x.unidad) === String(id));
      if (u) {
        u.pin = pin;
        writeJson(unitsFile, dbData.units);
        return u;
      }
      return null;
    },
    regeneratePin(id) {
      const u = dbData.units.find(x => String(x.id) === String(id) || String(x.unidad) === String(id));
      if (u) {
        u.pin = Math.floor(1000 + Math.random() * 9000).toString();
        writeJson(unitsFile, dbData.units);
        return u;
      }
      return null;
    },
    setPropietario(id, propietario) {
      const u = dbData.units.find(x => String(x.id) === String(id) || String(x.unidad) === String(id));
      if (u) {
        u.propietario = propietario;
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
    }
  }
};

module.exports = db;
