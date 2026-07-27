// Base de datos simple en archivo JSON (sin dependencias nativas -> despliega en cualquier hosting sin compilar nada).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');

let state = {
  units: [],
  reservations: [],
  admin: [],
  report_log: [],
  _seq: { reservations: 1, admin: 1, report_log: 1 }
};

function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      state = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      state._seq = state._seq || { reservations: 1, admin: 1, report_log: 1 };
    } catch (e) {
      console.error('[db] Error leyendo db.json, se reinicia:', e.message);
    }
  }
}

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

load();

// --- Seed de unidades reales (desde data/units.json, extraído del PDF de expensas) ---
function seedUnits() {
  const unitsSeedPath = path.join(__dirname, 'data', 'units.json');
  if (!fs.existsSync(unitsSeedPath)) return;
  const seed = JSON.parse(fs.readFileSync(unitsSeedPath, 'utf-8'));
  const existingCodes = new Set(state.units.map(u => u.unidad));
  let nextId = state.units.reduce((max, u) => Math.max(max, u.id), 0) + 1;
  for (const u of seed) {
    if (!existingCodes.has(u.unidad)) {
      state.units.push({ id: nextId++, unidad: u.unidad, piso: u.piso, dto: u.dto, propietario: u.propietario });
    }
  }
}
seedUnits();

// --- Seed de admin desde variables de entorno ---
// Sincroniza el usuario/contraseña del admin con las variables de entorno en cada arranque,
// así ADMIN_USER / ADMIN_PASSWORD siempre reflejan lo configurado en el hosting (.env).
function ensureAdmin() {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(pass, 10);
  const existing = state.admin.find(a => a.username === user);
  if (existing) {
    existing.password_hash = hash;
  } else {
    // Si cambió el usuario configurado, se reemplaza el admin anterior por el nuevo.
    state.admin = [{ id: state._seq.admin++, username: user, password_hash: hash }];
    console.log(`[admin] Usuario admin creado: ${user}`);
  }
}
ensureAdmin();
persist();

// ================= API tipo "repositorio" =================

const units = {
  all() {
    const pisoRank = (p) => (p === 'PB' ? -1 : /^\d+$/.test(p) ? Number(p) : 99);
    return [...state.units].sort((a, b) => pisoRank(a.piso) - pisoRank(b.piso) || a.dto.localeCompare(b.dto));
  },
  byId(id) {
    return state.units.find(u => u.id === Number(id));
  }
};

function withUnit(r) {
  const u = units.byId(r.unit_id) || {};
  return { ...r, unidad: u.unidad, piso: u.piso, dto: u.dto, propietario: u.propietario };
}

const reservations = {
  all() {
    return state.reservations.map(withUnit).sort((a, b) => a.date.localeCompare(b.date) || a.turno.localeCompare(b.turno));
  },
  byYear(year) {
    return this.all().filter(r => r.date.startsWith(String(year)));
  },
  byRange(from, to) {
    return this.all().filter(r => r.date >= from && r.date <= to);
  },
  byPeriod(period) {
    return this.all().filter(r => r.date.startsWith(period));
  },
  byId(id) {
    const r = state.reservations.find(r => r.id === Number(id));
    return r ? withUnit(r) : null;
  },
  findConflict(date, turno, excludeId) {
    return state.reservations.find(r => r.date === date && r.turno === turno && r.id !== Number(excludeId));
  },
  create({ date, turno, unit_id, nombre, apellido, edit_token }) {
    const id = state._seq.reservations++;
    const now = new Date().toISOString();
    const row = { id, date, turno, unit_id: Number(unit_id), nombre, apellido, edit_token, created_at: now, updated_at: null };
    state.reservations.push(row);
    persist();
    return withUnit(row);
  },
  update(id, fields) {
    const idx = state.reservations.findIndex(r => r.id === Number(id));
    if (idx === -1) return null;
    state.reservations[idx] = { ...state.reservations[idx], ...fields, updated_at: new Date().toISOString() };
    persist();
    return withUnit(state.reservations[idx]);
  },
  remove(id) {
    const before = state.reservations.length;
    state.reservations = state.reservations.filter(r => r.id !== Number(id));
    persist();
    return state.reservations.length < before;
  },
  distinctPeriods() {
    const set = new Set(state.reservations.map(r => r.date.slice(0, 7)));
    return [...set].sort().reverse();
  }
};

const admin = {
  byUsername(username) {
    return state.admin.find(a => a.username === username);
  }
};

const reportLog = {
  all() {
    return [...state.report_log].sort((a, b) => b.sent_at.localeCompare(a.sent_at)).slice(0, 50);
  },
  add({ period, sent_at, recipient, status }) {
    state.report_log.push({ id: state._seq.report_log++, period, sent_at, recipient, status });
    persist();
  }
};

module.exports = { units, reservations, admin, reportLog };
