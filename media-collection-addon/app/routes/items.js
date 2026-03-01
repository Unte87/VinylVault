'use strict';

/**
 * routes/items.js
 * CRUD routes for individual media items and the "add" workflow.
 *
 * POST /items/add        – search MusicBrainz, then store result
 * GET  /items/add        – render the add form
 * GET  /items/:id        – detail page
 * POST /items/:id        – update notes / owned / wishlist
 * POST /items/:id/delete – delete item
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { searchMusicBrainz, searchMusicBrainzMultiple, fetchCoverUrl } = require('../musicbrainz');

const MEDIA_TYPES = ['vinyl'];

// ── Mehrere Einträge löschen ─────────────────────────────────────────────────────
router.post('/bulk-delete', (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    db.deleteItems(ids);
    res.redirect(`${res.app.locals.base}/`);
  } catch (err) {
    next(err);
  }
});

// ── Add item ──────────────────────────────────────────────────────────────────

router.get('/add', (req, res) => {
  res.render('add', { mediaTypes: MEDIA_TYPES, error: null });
});

router.post('/add', async (req, res, next) => {
  try {
    const { title, artist, media_type, owned, wishlist, rating, cover_url, mbid, year } = req.body;

    if (!title || !title.trim()) {
      return res.render('add', {
        mediaTypes: MEDIA_TYPES,
        error: 'Bitte einen Titel eingeben.',
      });
    }

    // Wenn mbid bereits bekannt (aus der Suchauswahl), direkt speichern –
    // keine zweite MusicBrainz-Anfrage nötig.
    let finalTitle  = title.trim();
    let finalArtist = (artist || '').trim();
    let finalYear   = (year   || '').trim();
    let finalCover  = cover_url || '';
    let finalMbid   = mbid || '';

    if (!finalMbid) {
      // Manueller Tab: MusicBrainz-Suche als Fallback
      try {
        const mbData = await searchMusicBrainz(finalTitle, finalArtist);
        if (mbData) {
          finalTitle  = mbData.title  || finalTitle;
          finalArtist = mbData.artist || finalArtist;
          finalYear   = mbData.year   || finalYear;
          finalMbid   = mbData.mbid   || '';
          finalCover  = fetchCoverUrl(finalMbid);
        }
      } catch (mbErr) {
        console.warn('MusicBrainz-Suche fehlgeschlagen:', mbErr.message);
      }
    }

    const item = db.createItem({
      title:      finalTitle,
      artist:     finalArtist,
      year:       finalYear,
      media_type: media_type || 'vinyl',
      owned:      owned    === 'on' ? 1 : 0,
      wishlist:   wishlist  === 'on' ? 1 : 0,
      rating:     Number(rating) || 0,
      notes:      '',
      cover_url:  finalCover,
      mbid:       finalMbid,
    });

    res.redirect(`${res.app.locals.base}/items/${item.id}`);
  } catch (err) {
    next(err);
  }
});

// ── Detail page ───────────────────────────────────────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const item = db.getItemById(Number(req.params.id));
    if (!item) return res.status(404).render('error', { message: 'Item nicht gefunden.', base: res.app.locals.base });
    res.render('detail', { item, mediaTypes: MEDIA_TYPES });
  } catch (err) {
    next(err);
  }
});

// ── Update item ───────────────────────────────────────────────────────────────

router.post('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notes, owned, wishlist, title, artist, year, media_type, rating } = req.body;

    db.updateItem(id, {
      notes: notes ?? '',
      owned: owned === 'on' ? 1 : 0,
      wishlist: wishlist === 'on' ? 1 : 0,
      rating: Number(rating) || 0,
      title: title?.trim() || undefined,
      artist: artist?.trim() || undefined,
      year: year?.trim() || undefined,
      media_type: media_type || undefined,
    });

    res.redirect(`${res.app.locals.base}/items/${id}`);
  } catch (err) {
    next(err);
  }
});

// ── Delete item ───────────────────────────────────────────────────────────────

router.post('/:id/delete', (req, res, next) => {
  try {
    db.deleteItem(Number(req.params.id));
    res.redirect(`${res.app.locals.base}/`);
  } catch (err) {
    next(err);
  }
});

// ── Metadaten-Vorschläge laden (Vorschau-Seite) ──────────────────────────────
// GET -> MusicBrainz-Suche mit bis zu 5 Treffern -> Auswahl zeigen

router.get('/:id/refresh', async (req, res, next) => {
  try {
    const id   = Number(req.params.id);
    const item = db.getItemById(id);
    if (!item) return res.status(404).render('error', { message: 'Item nicht gefunden.', base: res.app.locals.base });

    let suggestions = [];
    let searchError = null;
    try {
      suggestions = await searchMusicBrainzMultiple(item.title, 5, item.artist || '');
    } catch (mbErr) {
      searchError = 'MusicBrainz-Suche fehlgeschlagen: ' + mbErr.message;
    }

    res.render('refresh', { item, suggestions, searchError });
  } catch (err) {
    next(err);
  }
});

// ── Ausgewählten Vorschlag übernehmen ─────────────────────────────────────────
// POST -> ausgewählte Felder (title, artist, year, cover_url, mbid) speichern

router.post('/:id/refresh/apply', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = db.getItemById(id);
    if (!item) return res.status(404).render('error', { message: 'Item nicht gefunden.', base: res.app.locals.base });

    const { title, artist, year, cover_url, mbid } = req.body;
    db.updateItem(id, {
      title:     title?.trim()     || item.title,
      artist:    artist?.trim()    || item.artist,
      year:      year?.trim()      || item.year,
      cover_url: cover_url?.trim() || item.cover_url,
      mbid:      mbid?.trim()      || item.mbid,
    });

    res.redirect(`${res.app.locals.base}/items/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
