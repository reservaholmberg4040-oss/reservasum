:root {
  --primary: #4f46e5;
  --primary-dark: #3730a3;
  --primary-light: #818cf8;
  --accent: #06b6d4;
  --dia: #f59e0b;
  --dia-bg: #fef3c7;
  --noche: #4338ca;
  --noche-bg: #e0e7ff;
  --libre: #10b981;
  --libre-bg: #d1fae5;
  --danger: #ef4444;
  --danger-bg: #fee2e2;
  --bg: #f4f5fb;
  --card: #ffffff;
  --text: #1f2937;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --radius: 14px;
  --shadow: 0 4px 16px rgba(31, 41, 55, 0.06);
  --shadow-lg: 0 12px 32px rgba(31, 41, 55, 0.14);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }

/* ---------- Header ---------- */
.topbar {
  background: linear-gradient(120deg, var(--primary-dark), var(--primary) 60%, var(--accent));
  color: #fff;
  padding: 22px 28px;
  box-shadow: var(--shadow);
  position: sticky;
  top: 0;
  z-index: 40;
}
.topbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
}
.brand-text h1 { margin: 0; font-size: 18px; font-weight: 700; }
.brand-text p { margin: 0; font-size: 12.5px; opacity: 0.85; }
.nav-links { display: flex; gap: 8px; align-items: center; }
.nav-links a, .nav-links button {
  color: #fff; background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.25);
  padding: 9px 16px; border-radius: 10px; font-size: 13.5px; font-weight: 600;
  cursor: pointer; transition: 0.15s;
}
.nav-links a:hover, .nav-links button:hover { background: rgba(255,255,255,0.28); }
.nav-links a.active { background: #fff; color: var(--primary-dark); }

/* ---------- Layout ---------- */
.container { max-width: 1200px; margin: 0 auto; padding: 24px 20px 60px; }

.page-title { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 20px; }
.page-title h2 { margin: 0; font-size: 22px; }
.page-title p { margin: 4px 0 0; color: var(--text-muted); font-size: 14px; }

.legend { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: var(--text-muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.dia { background: var(--dia); }
.dot.noche { background: var(--noche); }
.dot.libre { background: var(--libre); }

/* ---------- Year switcher ---------- */
.year-switcher { display: flex; align-items: center; gap: 12px; background: var(--card); border-radius: 12px; padding: 6px 10px; box-shadow: var(--shadow); }
.year-switcher button { background: var(--bg); border: none; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 16px; font-weight: 700; color: var(--primary); }
.year-switcher span { font-weight: 700; font-size: 16px; min-width: 52px; text-align: center; }

/* ---------- Calendar grid (year) ---------- */
.year-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.month-card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
}
.month-card h3 {
  margin: 0 0 12px; font-size: 15px; text-transform: capitalize;
  color: var(--primary-dark); font-weight: 700;
}
.dow-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 4px; }
.dow-row span { font-size: 10.5px; text-align: center; color: var(--text-muted); font-weight: 600; }
.days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.day-cell {
  aspect-ratio: 1;
  border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 600; cursor: pointer; position: relative;
  border: 1px solid transparent;
  background: #fafafa;
  transition: 0.12s;
}
.day-cell:hover { border-color: var(--primary-light); transform: scale(1.06); }
.day-cell.empty { visibility: hidden; cursor: default; }
.day-cell.today { box-shadow: inset 0 0 0 2px var(--primary); }
.day-cell.past { opacity: 0.45; }
.day-num { line-height: 1; }
.day-marks { display: flex; gap: 2px; margin-top: 2px; }
.day-marks i { width: 6px; height: 6px; border-radius: 50%; display: block; background: var(--border); }
.day-marks i.on-dia { background: var(--dia); }
.day-marks i.on-noche { background: var(--noche); }

/* ---------- Modal ---------- */
.overlay {
  position: fixed; inset: 0; background: rgba(17, 24, 39, 0.55);
  display: none; align-items: center; justify-content: center; z-index: 100; padding: 16px;
  backdrop-filter: blur(2px);
}
.overlay.show { display: flex; }
.modal {
  background: var(--card); border-radius: 18px; width: 100%; max-width: 460px;
  box-shadow: var(--shadow-lg); padding: 24px; max-height: 90vh; overflow-y: auto;
  animation: pop .15s ease-out;
}
@keyframes pop { from { transform: scale(.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.modal h3 { margin: 0 0 4px; font-size: 18px; }
.modal .sub { color: var(--text-muted); font-size: 13px; margin-bottom: 18px; }
.modal-close { position: absolute; top: 16px; right: 16px; cursor: pointer; background: none; border: none; font-size: 20px; color: var(--text-muted); }

.turno-card {
  border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px;
}
.turno-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.turno-badge { font-size: 12.5px; font-weight: 700; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 5px; }
.turno-badge.dia { background: var(--dia-bg); color: #92400e; }
.turno-badge.noche { background: var(--noche-bg); color: var(--noche); }
.status-pill { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
.status-pill.libre { background: var(--libre-bg); color: #065f46; }
.status-pill.ocupado { background: var(--danger-bg); color: #991b1b; }
.turno-info { font-size: 13.5px; color: var(--text); margin-bottom: 8px; }
.turno-info b { color: var(--text); }

.btn { border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13.5px; cursor: pointer; transition: .15s; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-outline { background: #fff; border: 1px solid var(--border); color: var(--text); }
.btn-outline:hover { background: var(--bg); }
.btn-danger { background: var(--danger-bg); color: #991b1b; }
.btn-danger:hover { background: #fecaca; }
.btn-block { width: 100%; }
.btn-sm { padding: 6px 12px; font-size: 12.5px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 5px; }
.form-group input, .form-group select {
  width: 100%; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border);
  font-size: 14px; font-family: inherit; background: #fff;
}
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,70,229,.12); }
.form-row { display: flex; gap: 10px; }
.form-row .form-group { flex: 1; }

.alert { padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; font-weight: 600; }
.alert-error { background: var(--danger-bg); color: #991b1b; }
.alert-success { background: var(--libre-bg); color: #065f46; }

/* ---------- Mis reservas ---------- */
.mr-list { display: flex; flex-direction: column; gap: 10px; }
.mr-item {
  background: var(--card); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow);
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
}
.mr-item .info { font-size: 13.5px; }
.mr-item .info b { display: block; font-size: 14.5px; }
.mr-actions { display: flex; gap: 8px; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state .big { font-size: 40px; margin-bottom: 10px; }

/* ---------- Toast ---------- */
.toast-wrap { position: fixed; bottom: 20px; right: 20px; z-index: 200; display: flex; flex-direction: column; gap: 10px; }
.toast { background: #111827; color: #fff; padding: 12px 18px; border-radius: 10px; font-size: 13.5px; box-shadow: var(--shadow-lg); animation: slidein .2s ease-out; max-width: 320px; }
.toast.error { background: #991b1b; }
.toast.success { background: #065f46; }
@keyframes slidein { from { transform: translateX(30px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }

/* ---------- Admin ---------- */
.login-wrap { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
.login-card { background: var(--card); border-radius: 18px; box-shadow: var(--shadow-lg); padding: 36px; width: 100%; max-width: 380px; }
.login-card h2 { margin-top: 0; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { background: var(--card); border-radius: 14px; padding: 18px 20px; box-shadow: var(--shadow); }
.stat-card .label { font-size: 12.5px; color: var(--text-muted); font-weight: 600; }
.stat-card .value { font-size: 26px; font-weight: 800; color: var(--primary-dark); margin-top: 4px; }

.table-card { background: var(--card); border-radius: 14px; box-shadow: var(--shadow); padding: 20px; overflow-x: auto; margin-bottom: 24px; }
.table-card h3 { margin-top: 0; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
th { color: var(--text-muted); font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
tr:hover td { background: #fafaff; }

.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
.toolbar select, .toolbar input { padding: 9px 12px; border-radius: 9px; border: 1px solid var(--border); font-size: 13.5px; }

@media (max-width: 640px) {
  .topbar { padding: 16px; }
  .nav-links { width: 100%; justify-content: flex-start; }
  .year-grid { grid-template-columns: 1fr; }
}
