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
const { searchMusicBrainz, fetchCoverUrl } = require('../musicbrainz');

const MEDIA_TYPES = ['vinyl'];

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

// ── Metadaten nachladen ───────────────────────────────────────────────────────
// Ruft MusicBrainz mit Titel + Künstler des Eintrags auf und aktualisiert
// Cover, MBID und Jahr. Nützlich für CSV-Imports ohne Live-Metadaten.

router.post('/:id/refresh', async (req, res, next) => {
  try {
    const id   = Number(req.params.id);
    const item = db.getItemById(id);
    if (!item) return res.status(404).render('error', { message: 'Item nicht gefunden.', base: res.app.locals.base });

    const mbData = await searchMusicBrainz(item.title, item.artist || '');

    if (mbData) {
      db.updateItem(id, {
        title:     mbData.title  || item.title,
        artist:    mbData.artist || item.artist,
        year:      mbData.year   || item.year,
        cover_url: fetchCoverUrl(mbData.mbid),
        mbid:      mbData.mbid,
      });
    }

    res.redirect(`${res.app.locals.base}/items/${id}`);
  } catch (err) {
    // Bei API-Fehler trotzdem zurück zur Detailseite
    console.error('Metadaten-Refresh fehlgeschlagen:', err.message);
    res.redirect(`${res.app.locals.base}/items/${req.params.id}`);
  }
});

module.exports = router;
