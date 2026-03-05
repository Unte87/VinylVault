'use strict';

/**
 * discogs.js
 *
 * Discogs-API-Wrapper für Metadaten und Cover.
 * Dokumentation: https://www.discogs.com/developers/
 *
 * Authentifizierung: Persönlicher Access Token
 *   Header: Authorization: Discogs token=<TOKEN>
 *
 * Rate-Limit: 60 Anfragen/Minute (authentifiziert).
 * Alle Requests laufen durch einen globalen Queue mit min. 1s Abstand.
 */

const axios = require('axios');

const BASE_URL   = 'https://api.discogs.com';
const USER_AGENT = 'VinylVault/1.0 +https://github.com/YOUR_GITHUB_USERNAME/VinylVault';

// ── HTTP-Client ───────────────────────────────────────────────────────────────

function buildClient(token) {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: {
      'User-Agent':    USER_AGENT,
      'Authorization': `Discogs token=${token}`,
    },
  });
}

// ── Rate-Limiter (1 Req/s, geteilt über alle Discogs-Calls) ──────────────────

const RATE_MS    = 1100;
let lastCallAt   = 0;
let callQueue    = Promise.resolve();

function rateLimited(fn) {
  callQueue = callQueue.then(async () => {
    const wait = RATE_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  return callQueue;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Retry bei transienten Fehlern ─────────────────────────────────────────────

async function discogsGet(client, path, params, attempt = 1) {
  try {
    return await client.get(path, { params });
  } catch (err) {
    const status    = err.response?.status;
    const retryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT'
                   || status === 429 || (status >= 500 && status < 600);
    if (retryable && attempt < 4) {
      const delay = attempt * 2000;
      console.warn(`Discogs ${err.code || status} – Retry ${attempt}/3 in ${delay}ms`);
      await sleep(delay);
      return discogsGet(client, path, params, attempt + 1);
    }
    throw err;
  }
}

// ── Release-Suche ─────────────────────────────────────────────────────────────

/**
 * Sucht Releases bei Discogs.
 * @param {string} title   Album-Titel
 * @param {string} artist  Künstlername (optional)
 * @param {string} token   Persönlicher Access Token
 * @param {number} limit   Max. Anzahl Ergebnisse
 * @returns {Promise<Array<{title,artist,year,cover_url,discogs_id,source}>>}
 */
async function searchDiscogs(title, artist = '', token, limit = 5) {
  if (!token) throw new Error('Kein Discogs-Token konfiguriert.');

  const client = buildClient(token);

  const params = {
    type:     'release',
    per_page: limit,
    page:     1,
  };

  // Discogs unterscheidet title und artist als separate Felder
  if (title)  params.title  = title;
  if (artist) params.artist = artist;

  const { data } = await rateLimited(() => discogsGet(client, '/database/search', params));

  return (data.results || []).map(mapResult);
}

function mapResult(r) {
  // r.title hat meist das Format "Künstler - Album"
  let title  = r.title  || '';
  let artist = '';
  const dash = title.indexOf(' - ');
  if (dash !== -1) {
    artist = title.slice(0, dash).trim();
    title  = title.slice(dash + 3).trim();
  }

  // community.have ist ein Indikator für Popularität / Relevanz
  return {
    title,
    artist,
    year:       String(r.year || ''),
    cover_url:  r.cover_image || r.thumb || '',
    discogs_id: String(r.id || ''),
    mbid:       '',          // Discogs liefert keine MBIDs
    source:     'discogs',
    score:      null,        // Discogs hat kein Relevanz-Score im Such-Response
  };
}

// ── Einzel-Release (für genauere Metadaten) ───────────────────────────────────

/**
 * Lädt vollständige Metadaten für einen bekannten Discogs-Release.
 * @param {string} discogsId  Discogs Release-ID
 * @param {string} token
 */
async function getReleaseById(discogsId, token) {
  if (!token) throw new Error('Kein Discogs-Token konfiguriert.');
  const client = buildClient(token);
  const { data } = await rateLimited(() =>
    discogsGet(client, `/releases/${discogsId}`, {})
  );
  return data;
}

// ── Token-Helper ──────────────────────────────────────────────────────────────

/** Liest den Discogs-Token aus der Umgebungsvariable oder HA-Options. */
function getToken() {
  return process.env.DISCOGS_TOKEN || '';
}

/** Gibt true zurück, wenn ein Token konfiguriert ist. */
function hasToken() {
  return Boolean(getToken());
}

module.exports = { searchDiscogs, getReleaseById, getToken, hasToken };
