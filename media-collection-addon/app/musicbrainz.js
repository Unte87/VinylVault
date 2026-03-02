'use strict';

/**
 * musicbrainz.js
 *
 * MusicBrainz-API und Cover Art Archive Hilfsfunktionen.
 *
 * Endpunkte:
 *   Release-Suche:  https://musicbrainz.org/ws/2/release/?query=…&fmt=json
 *   Künstler-Suche: https://musicbrainz.org/ws/2/artist/?query=…&fmt=json
 *   Release-Groups: https://musicbrainz.org/ws/2/release-group/?artist=<mbid>&fmt=json
 *   Cover:          https://coverartarchive.org/release/<mbid>/front-250
 *   Cover (RG):     https://coverartarchive.org/release-group/<mbid>/front-250
 *
 * Rate-Limit: max. 1 Anfrage/Sekunde (MusicBrainz-Vorgabe).
 * Alle Requests laufen durch einen globalen sequenziellen Queue mit 1.1s Abstand.
 */

const axios = require('axios');

const USER_AGENT = 'MediaDock/1.0.5 (home-assistant-addon)';

const http = axios.create({
  timeout: 15_000,
  headers: { 'User-Agent': USER_AGENT },
});

// ── Globaler Rate-Limiter ─────────────────────────────────────────────────────
// Stellt sicher, dass nie mehr als 1 Anfrage/Sekunde an MusicBrainz geht,
// egal wie viele gleichzeitige Nutzer/CSV-Imports aktiv sind.

const RATE_MS = 1150; // etwas über 1s Sicherheitspuffer
let lastRequestAt = 0;
let requestQueue  = Promise.resolve();

function rateLimitedGet(url, config) {
  requestQueue = requestQueue.then(async () => {
    const now  = Date.now();
    const wait = RATE_MS - (now - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return mbGet(url, config);
  });
  return requestQueue;
}

/** HTTP-GET mit bis zu 3 Retries bei ECONNRESET / 429 / 5xx */
async function mbGet(url, config, attempt = 1) {
  try {
    return await http.get(url, config);
  } catch (err) {
    const status   = err.response?.status;
    const retryable = err.code === 'ECONNRESET'
      || err.code === 'ECONNABORTED'
      || err.code === 'ETIMEDOUT'
      || status === 429
      || (status >= 500 && status < 600);

    if (retryable && attempt < 4) {
      const delay = attempt * 2000; // 2s, 4s, 6s
      console.warn(`MusicBrainz ${err.code || status} – Retry ${attempt}/3 in ${delay}ms`);
      await sleep(delay);
      return mbGet(url, config, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Release-Suche ─────────────────────────────────────────────────────────────

/**
 * Gibt das erste MusicBrainz-Suchergebnis zurück.
 * Wenn `artist` angegeben ist, verwendet die Suche Lucene-Feldsyntax:
 *   release:"Greatest Hits" AND artist:"Foo Fighters"
 * Das liefert erheblich präzisere Treffer als eine Freitextsuche.
 */
async function searchMusicBrainz(title, artist = '') {
  const results = await searchMusicBrainzMultiple(title, 1, artist);
  return results.length > 0 ? results[0] : null;
}

/**
 * Sucht nach Releases und gibt bis zu `limit` Ergebnisse zurück.
 *
 * Strategie (von präzise → tolerant, stoppt sobald Treffer da sind):
 *   1. Phrase AND:  release:"<title>" AND artist:"<artist>"
 *   2. Phrase:      release:"<title>"
 *   3. Term AND:    release:(<title>) AND artist:(<artist>)   ← trifft auch "Live at CBGB"
 *   4. Term:        release:(<title>)
 *   5. Fuzzy AND:   release:(title~) AND artist:(artist~)
 *   6. Fuzzy:       release:(title~)
 *
 * OR-Stufen wurden bewusst entfernt: artist-Only-OR gibt alle Releases des Künstlers
 * zurück und stoppt die Kaskade bevor die präzisere Term-Suche greift.
 *
 * Die MusicBrainz-Suche ist von Haus aus case-insensitiv.
 */
async function searchMusicBrainzMultiple(title, limit = 5, artist = '') {
  // Sonderzeichen escapen (für alle Stufen)
  const escQuote = (s) => s.replace(/["\\]/g, '\\$&').trim();
  const escTerm  = (s) => s.replace(/["\\+\-!(){}\[\]^~*?:|&]/g, ' ').trim();

  const tQ = escQuote(title);
  const aQ = escQuote(artist);
  const tT = escTerm(title);
  const aT = escTerm(artist);

  const queries = [];

  // Stufe 1: Exaktes Phrase-Match beider Felder (AND)
  if (artist) queries.push(`release:"${tQ}" AND artist:"${aQ}"`);

  // Stufe 2: Exaktes Phrase-Match nur Titel
  queries.push(`release:"${tQ}"`);

  // Stufe 3: Term-Match AND – zuverlässigste Stufe für Titel mit Stoppwörtern wie
  //          "Live at CBGB": Lucene/MusicBrainz prüft einzelne Terme, "at" wird
  //          dabei nicht als Stoppwort gefiltert.
  if (artist) queries.push(`release:(${tT}) AND artist:(${aT})`);

  // Stufe 4: Term-Match nur Titel
  queries.push(`release:(${tT})`);

  // Stufe 5: Fuzzy AND (Tipp-Toleranz) – kurze/gängige Wörter (<= 3 Zeichen) NICHT fuzzy,
  //          damit "at", "the", "in" keine falschen Varianten erzeugen.
  const fuzzyTitle  = tT.split(/\s+/).filter(Boolean).map(t => t.length > 3 ? `${t}~` : t).join(' ');
  const fuzzyArtist = aT.split(/\s+/).filter(Boolean).map(t => t.length > 3 ? `${t}~` : t).join(' ');
  if (artist) queries.push(`release:(${fuzzyTitle}) AND artist:(${fuzzyArtist})`);

  // Stufe 6: Fuzzy nur Titel (letzter Ausweg)
  queries.push(`release:(${fuzzyTitle})`);

  for (const query of queries) {
    const { data } = await rateLimitedGet('https://musicbrainz.org/ws/2/release/', {
      params: { query, fmt: 'json', limit, inc: 'tags release-groups' },
    });
    const results = (data.releases || []).map(mapRelease);
    if (results.length > 0) return results;
  }
  return [];
}

function mapRelease(release) {
  const artist = (release['artist-credit'] || [])
    .map((ac) => (typeof ac === 'string' ? ac : ac.artist?.name || ac.name || ''))
    .join('').trim();
  const mbid   = release.id || '';
  const rgMbid = release['release-group']?.id || '';
  // Tags nach Vote-Count sortieren, Top-5, kommagetrennt
  const genre = (release.tags || [])
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 5)
    .map(t => t.name)
    .join(', ');
  return {
    title: release.title || '',
    artist,
    year: (release.date || '').slice(0, 4),
    mbid,
    rgMbid,
    genre,
    score: release.score ?? null,
    source: 'musicbrainz',
    cover_url:    mbid   ? `https://coverartarchive.org/release/${mbid}/front-250`               : '',
    rg_cover_url: rgMbid ? `https://coverartarchive.org/release-group/${rgMbid}/front-250` : '',
  };
}

// ── Künstler-Suche ────────────────────────────────────────────────────────────

/**
 * Sucht Künstler bei MusicBrainz.
 * @returns {Promise<Array<{name, mbid, country, disambiguation}>>}
 */
async function searchArtists(query, limit = 8) {
  const { data } = await rateLimitedGet('https://musicbrainz.org/ws/2/artist/', {
    params: { query, fmt: 'json', limit },
  });

  return (data.artists || []).map((a) => ({
    name: a.name || '',
    mbid: a.id || '',
    country: a.country || '',
    disambiguation: a.disambiguation || '',
  }));
}

// ── Diskografie eines Künstlers ───────────────────────────────────────────────

/**
 * Gibt die Release-Groups eines Künstlers zurück.
 * Release-Groups vermeiden Duplikate durch mehrere Editionen.
 * @returns {Promise<Array<{title, artist, year, mbid, type, cover_url}>>}
 */
async function getReleaseGroupsByArtist(artistMbid, limit = 50) {
  const { data } = await rateLimitedGet('https://musicbrainz.org/ws/2/release-group/', {
    params: { artist: artistMbid, fmt: 'json', limit, inc: 'artist-credits' },
  });

  const groups = (data['release-groups'] || []).map((rg) => {
    const artist = (rg['artist-credit'] || [])
      .map((ac) => (typeof ac === 'string' ? ac : ac.artist?.name || ''))
      .join('').trim();
    return {
      title: rg.title || '',
      artist,
      year: (rg['first-release-date'] || '').slice(0, 4),
      mbid: rg.id || '',
      type: rg['primary-type'] || 'Album',
      cover_url: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
    };
  });

  const order = ['Album', 'EP', 'Single', 'Other'];
  return groups.sort((a, b) => {
    const ta = order.indexOf(a.type);
    const tb = order.indexOf(b.type);
    if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
    return (b.year || '0').localeCompare(a.year || '0');
  });
}

// ── Cover Art Archive ─────────────────────────────────────────────────────────

/** Cover-URL für eine Release-MBID (der Browser folgt dem Redirect selbst). */
function fetchCoverUrl(mbid) {
  if (!mbid) return '';
  return `https://coverartarchive.org/release/${mbid}/front-250`;
}

/** Cover-URL für eine Release-Group-MBID. */
function fetchReleaseGroupCoverUrl(rgMbid) {
  if (!rgMbid) return '';
  return `https://coverartarchive.org/release-group/${rgMbid}/front-250`;
}

module.exports = {
  searchMusicBrainz,
  searchMusicBrainzMultiple,
  searchArtists,
  getReleaseGroupsByArtist,
  fetchCoverUrl,
  fetchReleaseGroupCoverUrl,
};
