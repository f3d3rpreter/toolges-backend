const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Conectar a la base de datos SQLite (archivo)
const db = new sqlite3.Database('./database.db');

// Crear tablas si no existen
db.serialize(() => {
  // Inventario
  db.run(`CREATE TABLE IF NOT EXISTS inventario (
    id TEXT PRIMARY KEY,
    ref TEXT UNIQUE,
    marca TEXT,
    descripcion TEXT,
    stock INTEGER,
    minStock INTEGER
  )`);

  // Escandallos
  db.run(`CREATE TABLE IF NOT EXISTS escandallos (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    nombre TEXT,
    fecha TEXT,
    dueDate TEXT,
    leadTimeDays INTEGER
  )`);

  // Componentes de escandallos
  db.run(`CREATE TABLE IF NOT EXISTS componentes (
    escandallo_id TEXT,
    ref TEXT,
    cantidad INTEGER,
    FOREIGN KEY(escandallo_id) REFERENCES escandallos(id)
  )`);

  // Historial (opcional)
  db.run(`CREATE TABLE IF NOT EXISTS historial (
    timestamp TEXT,
    mensaje TEXT
  )`);
});

// ---------- RUTAS API ----------

// Obtener todo el inventario
app.get('/api/inventario', (req, res) => {
  db.all('SELECT * FROM inventario', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Añadir o actualizar un artículo
app.post('/api/inventario', (req, res) => {
  const { id, ref, marca, descripcion, stock, minStock } = req.body;
  db.run(`INSERT OR REPLACE INTO inventario (id, ref, marca, descripcion, stock, minStock)
          VALUES (?, ?, ?, ?, ?, ?)`,
    [id, ref, marca, descripcion, stock, minStock],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// Modificar stock (+1 / -1)
app.put('/api/inventario/:id/stock', (req, res) => {
  const { delta } = req.body;
  db.run(`UPDATE inventario SET stock = stock + ? WHERE id = ?`, [delta, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Eliminar artículo
app.delete('/api/inventario/:id', (req, res) => {
  db.run(`DELETE FROM inventario WHERE id = ?`, req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Escandallos: listar
app.get('/api/escandallos', (req, res) => {
  db.all(`SELECT * FROM escandallos`, (err, escRows) => {
    if (err) return res.status(500).json({ error: err.message });
    let completos = 0;
    const resultado = [];
    const procesar = () => {
      if (completos === escRows.length) return res.json(resultado);
      const esc = escRows[completos];
      db.all(`SELECT ref, cantidad FROM componentes WHERE escandallo_id = ?`, [esc.id], (err2, comps) => {
        resultado.push({ ...esc, components: comps });
        completos++;
        procesar();
      });
    };
    procesar();
  });
});

// Crear/actualizar escandallo
app.post('/api/escandallos', (req, res) => {
  const { id, numero, nombre, fecha, dueDate, leadTimeDays, components } = req.body;
  db.run(`INSERT OR REPLACE INTO escandallos (id, numero, nombre, fecha, dueDate, leadTimeDays)
          VALUES (?, ?, ?, ?, ?, ?)`, [id, numero, nombre, fecha, dueDate, leadTimeDays], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    // Eliminar componentes antiguos
    db.run(`DELETE FROM componentes WHERE escandallo_id = ?`, [id], () => {
      let pendientes = components.length;
      if (pendientes === 0) return res.json({ success: true });
      components.forEach(c => {
        db.run(`INSERT INTO componentes (escandallo_id, ref, cantidad) VALUES (?, ?, ?)`,
          [id, c.ref, c.qty], (err2) => {
            if (err2) console.error(err2);
            pendientes--;
            if (pendientes === 0) res.json({ success: true });
          });
      });
    });
  });
});

// Eliminar escandallo
app.delete('/api/escandallos/:id', (req, res) => {
  db.run(`DELETE FROM componentes WHERE escandallo_id = ?`, [req.params.id], () => {
    db.run(`DELETE FROM escandallos WHERE id = ?`, [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// Historial (añadir evento)
app.post('/api/historial', (req, res) => {
  const { timestamp, mensaje } = req.body;
  db.run(`INSERT INTO historial (timestamp, mensaje) VALUES (?, ?)`, [timestamp, mensaje], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/historial', (req, res) => {
  db.all(`SELECT * FROM historial ORDER BY timestamp DESC LIMIT 100`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});