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

const MEDIA_TYPES = ['vinyl', 'cd', 'game', 'bluray', 'dvd', 'book', 'other'];

// ── Add item ──────────────────────────────────────────────────────────────────

router.get('/add', (req, res) => {
  res.render('add', { mediaTypes: MEDIA_TYPES, error: null });
});

router.post('/add', async (req, res, next) => {
  try {
    const { title, artist, media_type, owned, wishlist } = req.body;

    if (!title || !title.trim()) {
      return res.render('add', {
        mediaTypes: MEDIA_TYPES,
        error: 'Bitte einen Titel eingeben.',
      });
    }

    // Build a MusicBrainz search query from title + optional artist
    const query = artist ? `${title} ${artist}` : title;
    let mbData = null;

    try {
      mbData = await searchMusicBrainz(query);
    } catch (mbErr) {
      // API unreachable – fall back to manual entry
      console.warn('MusicBrainz-Suche fehlgeschlagen:', mbErr.message);
    }

    let coverUrl = '';
    if (mbData?.mbid) {
      try {
        coverUrl = await fetchCoverUrl(mbData.mbid);
      } catch (caErr) {
        console.warn('Cover Art Archive nicht erreichbar:', caErr.message);
      }
    }

    const item = db.createItem({
      title: mbData?.title || title.trim(),
      artist: mbData?.artist || (artist || '').trim(),
      year: mbData?.year || '',
      media_type: media_type || 'vinyl',
      owned: owned === 'on' ? 1 : 0,
      wishlist: wishlist === 'on' ? 1 : 0,
      notes: '',
      cover_url: coverUrl,
      mbid: mbData?.mbid || '',
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
    const { notes, owned, wishlist, title, artist, year, media_type } = req.body;

    db.updateItem(id, {
      notes: notes ?? '',
      owned: owned === 'on' ? 1 : 0,
      wishlist: wishlist === 'on' ? 1 : 0,
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

module.exports = router;
