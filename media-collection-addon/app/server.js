const express = require('express');
const path = require('path');
const morgan = require('morgan');

const addonConfig = require(path.join(__dirname, 'package.json'));

const db = require('./database');
const i18n = require('./i18n');
const indexRouter = require('./routes/index');
const itemsRouter = require('./routes/items');
const apiRouter   = require('./routes/api');
const csvRouter   = require('./routes/csv');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 8099;
const buildStamp = process.env.ASSET_VERSION || Date.now().toString();

// ── Template engine ──────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cache-busting for static assets: new stamp on every restart unless overridden.
app.locals.assetVersion = `${addonConfig.version || 'dev'}-${buildStamp}`;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));

// i18n – detect language from cookie / Accept-Language header
app.use(i18n.middleware);

// Home Assistant ingress sends the base path in the X-Ingress-Path header.
// Inject it into res.locals so every template and redirect can use it.
app.use((req, res, next) => {
  res.locals.base = (req.headers['x-ingress-path'] || '').replace(/\/$/, '');
  next();
});

// Static files
app.use('/public', express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/', indexRouter);
app.use('/items', itemsRouter);
app.use('/api', apiRouter);
app.use('/csv', csvRouter);

// Fallback 404
app.use((req, res) => {
  res.status(404).render('error', { message: res.locals.__('error_404'), base: res.locals.base });
});

// Global error handler. i18n / base may be missing if the error happened before
// their middleware ran (z.B. ungültiger JSON-Body), daher mit Fallbacks.
app.use((err, req, res, _next) => {
  console.error(err);
  const t    = typeof res.locals.__ === 'function' ? res.locals.__ : (k) => k;
  const base = res.locals.base || '';
  res.status(500).render('error', { message: t('error_500'), base });
});

// ── Startup ───────────────────────────────────────────────────────────────────
db.init();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VinylVault läuft auf http://0.0.0.0:${PORT}`);
});
