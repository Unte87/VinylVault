'use strict';

/**
 * routes/api.js
 * JSON API used by the frontend for live MusicBrainz search previews.
 *
 * GET /api/search?q=<query>  – returns up to 5 release candidates
 */

const express = require('express');
const router = express.Router();
const { searchMusicBrainzMultiple, fetchCoverUrl } = require('../musicbrainz');

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();

  if (!q) {
    return res.status(400).json({ error: 'Parameter q fehlt.' });
  }

  try {
    const results = await searchMusicBrainzMultiple(q, 5);

    // Optionally attach cover URLs (fire-and-forget, best-effort)
    const withCovers = await Promise.allSettled(
      results.map(async (r) => {
        if (r.mbid) {
          try {
            r.cover_url = await fetchCoverUrl(r.mbid);
          } catch {
            r.cover_url = '';
          }
        }
        return r;
      })
    );

    res.json(withCovers.map((p) => (p.status === 'fulfilled' ? p.value : p.reason)));
  } catch (err) {
    console.error('API-Suche fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

module.exports = router;
