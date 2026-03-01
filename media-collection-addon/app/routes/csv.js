'use strict';

/**
 * routes/csv.js
 * CSV-Import: Nutzer fügt CSV-Inhalt in ein Textarea-Formular ein.
 * Unterstützte Spalten (erste Zeile = Header, Semikolon oder Komma als Trennzeichen):
 *   title, artist, year, owned, wishlist, notes
 *
 * Einträge werden direkt ohne MusicBrainz-Anfrage angelegt.
 * Metadaten können anschließend über "Metadaten nachladen" in der Detailansicht geholt werden.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.render('csv', { imported: null, error: null });
});

router.post('/', (req, res, next) => {
  try {
    const raw = (req.body.csv || '').trim();
    if (!raw) {
      return res.render('csv', { imported: null, error: 'Keine Daten eingegeben.' });
    }

    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      return res.render('csv', { imported: null, error: 'CSV muss mindestens eine Header-Zeile und eine Datenzeile enthalten.' });
    }

    // Trennzeichen auto-erkennen (Semikolon bevorzugt, sonst Komma)
    const sep = lines[0].includes(';') ? ';' : ',';

    // Header normalisieren
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));

    const colIdx = name => {
      const i = headers.indexOf(name);
      return i >= 0 ? i : -1;
    };

    const col = (cells, name) => {
      const i = colIdx(name);
      return i >= 0 ? (cells[i] || '').trim() : '';
    };

    let importedCount = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSV-Felder parsen – einfaches Splitting (Anf. behandeln)
      const cells = parseCsvLine(line, sep);
      const title = col(cells, 'title');

      if (!title) {
        errors.push(`Zeile ${i + 1}: Titel fehlt – übersprungen.`);
        continue;
      }

      db.createItem({
        title,
        artist:    col(cells, 'artist'),
        year:      col(cells, 'year'),
        media_type: 'vinyl',
        owned:     ['1', 'true', 'ja', 'yes'].includes(col(cells, 'owned').toLowerCase()) ? 1 : 0,
        wishlist:  ['1', 'true', 'ja', 'yes'].includes(col(cells, 'wishlist').toLowerCase()) ? 1 : 0,
        notes:     col(cells, 'notes'),
        cover_url: '',
        mbid:      '',
        rating:    0,
      });
      importedCount++;
    }

    res.render('csv', {
      imported: { count: importedCount, errors },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Einfacher CSV-Zeilenparser mit Anführungszeichen-Support.
 * @param {string} line
 * @param {string} sep
 * @returns {string[]}
 */
function parseCsvLine(line, sep) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

module.exports = router;
