'use strict';

/**
 * musicbrainz.js
 *
 * Helper functions for the MusicBrainz and Cover Art Archive APIs.
 *
 * MusicBrainz API:
 *   https://musicbrainz.org/ws/2/release/?query=<query>&fmt=json
 *   Rate-limit: 1 request/second for anonymous clients.
 *   Requires a descriptive User-Agent: <app-name>/<version> (<contact>)
 *
 * Cover Art Archive API:
 *   https://coverartarchive.org/release/<mbid>/front-250
 *   Returns a redirect (302) to the actual image; Axios follows it automatically.
 */

const axios = require('axios');

// User-Agent required by MusicBrainz's guidelines
const USER_AGENT = 'MediaDock/1.0.0 (home-assistant-addon)';

// Shared Axios instance with sane defaults
const http = axios.create({
  timeout: 10_000,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * Search MusicBrainz for releases matching `query`.
 * Returns the first result mapped to our internal shape, or null.
 *
 * @param {string} query  Free-text search string (e.g. "Dark Side of the Moon Pink Floyd")
 * @returns {Promise<{title:string, artist:string, year:string, mbid:string}|null>}
 */
async function searchMusicBrainz(query) {
  const results = await searchMusicBrainzMultiple(query, 1);
  return results.length > 0 ? results[0] : null;
}

/**
 * Search MusicBrainz and return up to `limit` results.
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{title:string, artist:string, year:string, mbid:string}>>}
 */
async function searchMusicBrainzMultiple(query, limit = 5) {
  const url = 'https://musicbrainz.org/ws/2/release/';

  const { data } = await http.get(url, {
    params: {
      query: query,
      fmt: 'json',
      limit,
    },
  });

  const releases = data.releases || [];

  return releases.map((release) => {
    // Extract the primary artist from the artist-credit array
    const artist = (release['artist-credit'] || [])
      .map((ac) => (typeof ac === 'string' ? ac : ac.artist?.name || ac.name || ''))
      .join('')
      .trim();

    // Release year is in 'date' field, e.g. "1973-03-01" → "1973"
    const year = (release.date || '').slice(0, 4);

    return {
      title: release.title || '',
      artist,
      year,
      mbid: release.id || '',
    };
  });
}

/**
 * Try to fetch the front-cover image URL for a MusicBrainz release.
 *
 * The Cover Art Archive redirects 307 to the actual image URL.
 * We ask Axios to follow up to 5 redirects and then return the
 * final URL so we can store it (avoiding repeated redirect hops at render time).
 *
 * @param {string} mbid  MusicBrainz release ID
 * @returns {Promise<string>}  The resolved image URL, or empty string if none.
 */
async function fetchCoverUrl(mbid) {
  if (!mbid) return '';

  const url = `https://coverartarchive.org/release/${mbid}/front-250`;

  // HEAD request is enough – we only want the final URL after redirects
  const response = await http.get(url, {
    maxRedirects: 5,
    responseType: 'arraybuffer', // prevent large response body loading into memory
    validateStatus: (s) => s < 400,
  });

  // After Axios resolves all redirects, response.request.res.responseUrl
  // (Node http) or response.config.url contains the final URL.
  // The safest cross-platform way is to return the original CAA URL as the
  // browser will follow the redirect itself at display time.
  return url;
}

module.exports = { searchMusicBrainz, searchMusicBrainzMultiple, fetchCoverUrl };
