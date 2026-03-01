'use strict';

const express = require('express');
const path = require('path');
const morgan = require('morgan');

const db = require('./database');
const indexRouter = require('./routes/index');
const itemsRouter = require('./routes/items');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 8099;

// Home Assistant ingress sets a sub-path (e.g. /api/hassio_ingress/<token>).
// We read it at runtime so all links and static assets stay correct.
const INGRESS_PATH = (process.env.INGRESS_PATH || '').replace(/\/$/, '');

// ── Template engine ──────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make the ingress base-path available in every template
app.locals.base = INGRESS_PATH;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files are served under the ingress path as well
app.use(INGRESS_PATH + '/public', express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
// Mount all routes under INGRESS_PATH so they work both locally (path='')
// and behind Home Assistant ingress (path='/api/hassio_ingress/<token>').
app.use(INGRESS_PATH + '/', indexRouter);
app.use(INGRESS_PATH + '/items', itemsRouter);
app.use(INGRESS_PATH + '/api', apiRouter);

// Fallback 404
app.use((req, res) => {
  res.status(404).render('error', { message: '404 – Seite nicht gefunden', base: INGRESS_PATH });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: err.message || 'Interner Serverfehler', base: INGRESS_PATH });
});

// ── Startup ───────────────────────────────────────────────────────────────────
db.init();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MediaDock läuft auf http://0.0.0.0:${PORT}${INGRESS_PATH || '/'}`);
});

module.exports = app;
