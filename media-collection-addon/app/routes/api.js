'use strict';

/**
 * routes/api.js
 * JSON-API für die Frontend-Suche.
 *
 * GET /api/search?q=<title>&artist=<artist>  – bis zu 8 Release-Treffer (MusicBrainz)
 * GET /api/artists?q=<name>                  – Künstler-Suche
 * GET /api/artists/:mbid/releases            – Diskografie eines Künstlers
 */

const express = require('express');
const router  = express.Router();
const {
  searchMusicBrainzMultiple,
  searchArtists,
  getReleaseGroupsByArtist,
  fetchCoverUrl,
} = require('../musicbrainz');

// ── Release-Suche ────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const title  = (req.query.q      || '').trim();
  const artist = (req.query.artist || '').trim();
  if (!title) return res.status(400).json({ error: 'Parameter q fehlt.' });
  try {
    const results = await searchMusicBrainzMultiple(title, 20, artist);
    // cover_url bleibt aus mapRelease (Release-Cover), rg_cover_url als Fallback
    res.json(results);
  } catch (err) {
    console.error('Release-Suche fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

// ── Künstler-Suche ────────────────────────────────────────────────────────────
router.get('/artists', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parameter q fehlt.' });
  try {
    const artists = await searchArtists(q, 8);
    res.json(artists);
  } catch (err) {
    console.error('Künstler-Suche fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

// ── Diskografie eines Künstlers ───────────────────────────────────────────────
router.get('/artists/:mbid/releases', async (req, res) => {
  const { mbid } = req.params;
  try {
    const releases = await getReleaseGroupsByArtist(mbid, 50);
    res.json(releases);
  } catch (err) {
    console.error('Diskografie-Abfrage fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

module.exports = router;

// ── MusicBrainz Release-Suche ─────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const title  = (req.query.q      || '').trim();
  const artist = (req.query.artist || '').trim();
  if (!title) return res.status(400).json({ error: 'Parameter q fehlt.' });
  try {
    const results = await searchMusicBrainzMultiple(title, 8, artist);
    results.forEach(r => { r.cover_url = fetchCoverUrl(r.mbid); r.source = 'musicbrainz'; });
    res.json(results);
  } catch (err) {
    console.error('MusicBrainz-Suche fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

// ── Discogs Release-Suche ─────────────────────────────────────────────────────
router.get('/discogs/search', async (req, res) => {
  const title  = (req.query.q      || '').trim();
  const artist = (req.query.artist || '').trim();
  if (!title) return res.status(400).json({ error: 'Parameter q fehlt.' });
  if (!discogs.hasToken()) return res.status(503).json({ error: 'Kein Discogs-Token konfiguriert.' });
  try {
    const results = await discogs.searchDiscogs(title, artist, discogs.getToken(), 8);
    res.json(results);
  } catch (err) {
    console.error('Discogs-Suche fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'Discogs nicht erreichbar.' });
  }
});

// ── Discogs Token-Status ──────────────────────────────────────────────────────
router.get('/discogs/token', (req, res) => {
  res.json({ configured: discogs.hasToken() });
});

// ── Künstler-Suche ────────────────────────────────────────────────────────────
router.get('/artists', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parameter q fehlt.' });
  try {
    const artists = await searchArtists(q, 8);
    res.json(artists);
  } catch (err) {
    console.error('Künstler-Suche fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

// ── Diskografie eines Künstlers ───────────────────────────────────────────────
router.get('/artists/:mbid/releases', async (req, res) => {
  const { mbid } = req.params;
  try {
    const releases = await getReleaseGroupsByArtist(mbid, 50);
    res.json(releases);
  } catch (err) {
    console.error('Diskografie-Laden fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'MusicBrainz nicht erreichbar.' });
  }
});

module.exports = router;
