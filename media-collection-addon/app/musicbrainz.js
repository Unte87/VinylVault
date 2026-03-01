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
 * Rate-Limit: max. 1 Anfrage/Sekunde. User-Agent ist Pflicht.
 */

const axios = require('axios');

const USER_AGENT = 'MediaDock/1.0.1 (home-assistant-addon)';

const http = axios.create({
  timeout: 10_000,
  headers: { 'User-Agent': USER_AGENT },
});

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
 * Verwendet KEINE Anführungszeichen in der Lucene-Query, damit die Suche
 * case-insensitiv und tolerant gegenüber Tippfehlern ist.
 * "~" am Ende jedes Terms aktiviert Fuzzy-Matching (~0.8 Ähnlichkeit).
 */
async function searchMusicBrainzMultiple(title, limit = 5, artist = '') {
  // Sonderzeichen escapen, Kleinschreibung erzwingen
  const safeTitle  = title.toLowerCase().replace(/["\\+\-!(){}\[\]^~*?:|&]/g, ' ').trim();
  const safeArtist = artist.toLowerCase().replace(/["\\+\-!(){}\[\]^~*?:|&]/g, ' ').trim();

  // Fuzzy-Suche: jeder Term mit ~ für Tipp-Toleranz
  const fuzzyTitle  = safeTitle.split(/\s+/).map(t => `${t}~`).join(' ');
  const fuzzyArtist = safeArtist.split(/\s+/).map(t => `${t}~`).join(' ');

  const query = safeArtist
    ? `release:(${fuzzyTitle}) AND artist:(${fuzzyArtist})`
    : `release:(${fuzzyTitle})`;

  const { data } = await http.get('https://musicbrainz.org/ws/2/release/', {
    params: { query, fmt: 'json', limit },
  });

  return (data.releases || []).map(mapRelease);
}

function mapRelease(release) {
  const artist = (release['artist-credit'] || [])
    .map((ac) => (typeof ac === 'string' ? ac : ac.artist?.name || ac.name || ''))
    .join('').trim();
  return {
    title: release.title || '',
    artist,
    year: (release.date || '').slice(0, 4),
    mbid: release.id || '',
  };
}

// ── Künstler-Suche ────────────────────────────────────────────────────────────

/**
 * Sucht Künstler bei MusicBrainz.
 * @returns {Promise<Array<{name, mbid, country, disambiguation}>>}
 */
async function searchArtists(query, limit = 8) {
  const { data } = await http.get('https://musicbrainz.org/ws/2/artist/', {
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
  const { data } = await http.get('https://musicbrainz.org/ws/2/release-group/', {
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
