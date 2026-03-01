'use strict';

/**
 * routes/index.js
 * Main collection overview page.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

// Supported media types used in the filter UI
const MEDIA_TYPES = ['vinyl', 'cd', 'game', 'bluray', 'dvd', 'book', 'other'];

router.get('/', (req, res, next) => {
  try {
    const { type, status } = req.query;

    const items = db.getAllItems({
      media_type: type || 'all',
      status: status || undefined,
    });

    res.render('index', {
      items,
      mediaTypes: MEDIA_TYPES,
      selectedType: type || 'all',
      selectedStatus: status || 'all',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
