'use strict';

/**
 * routes/csv.js
 * CSV-Import: Nutzer fügt CSV-Inhalt in ein Textarea-Formular ein.
 * Unterstützte Spalten (erste Zeile = Header, Semikolon oder Komma als Trennzeichen):
 *   title, artist, year, genre, owned, wishlist, notes, cover_url
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

router.get('/export', (req, res, next) => {
  try {
    const items = db.getAllItems({ media_type: 'all' });
    const header = ['title', 'artist', 'year', 'genre', 'owned', 'wishlist', 'notes', 'cover_url'];
    const rows = items.map((item) => [
      item.title || '',
      item.artist || '',
      item.year || '',
      item.genre || '',
      item.owned ? '1' : '0',
      item.wishlist ? '1' : '0',
      item.notes || '',
      item.cover_url || '',
    ]);

    const csv = [header, ...rows]
      .map((cols) => cols.map(escapeCsvCell).join(';'))
      .join('\n');

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vinylvault-export-${stamp}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const raw = (req.body.csv || '').trim();
    if (!raw) {
      return res.render('csv', { imported: null, error: 'Keine Daten eingegeben.' });
    }

    // Trennzeichen auto-erkennen (Semikolon bevorzugt, sonst Komma)
    const firstLine = raw.split(/\r?\n/, 1)[0] || '';
    const sep = firstLine.includes(';') ? ';' : ',';

    // Ganzen Text in einem Durchgang parsen – respektiert Anführungszeichen,
    // auch mehrzeilige Felder und verdoppelte Quotes ("").
    const rows = parseCsv(raw, sep);
    if (rows.length < 2) {
      return res.render('csv', { imported: null, error: 'CSV muss mindestens eine Header-Zeile und eine Datenzeile enthalten.' });
    }

    // Header normalisieren
    const headers = (rows[0] || []).map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));

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

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      // Leerzeilen (z.B. abschließender Zeilenumbruch) überspringen
      if (!cells || cells.every(c => (c || '').trim() === '')) continue;

      const title = col(cells, 'title');

      if (!title) {
        errors.push(`Zeile ${i + 1}: Titel fehlt – übersprungen.`);
        continue;
      }

      db.createItem({
        title,
        artist:    col(cells, 'artist'),
        year:      col(cells, 'year'),
        genre:     col(cells, 'genre'),
        media_type: 'vinyl',
        owned:     ['1', 'true', 'ja', 'yes'].includes(col(cells, 'owned').toLowerCase()) ? 1 : 0,
        wishlist:  ['1', 'true', 'ja', 'yes'].includes(col(cells, 'wishlist').toLowerCase()) ? 1 : 0,
        notes:     col(cells, 'notes'),
        cover_url: col(cells, 'cover_url'),
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
 * CSV-Parser über den gesamten Text. Respektiert Anführungszeichen inkl.
 * eingebetteter Zeilenumbrüche und verdoppelter Quotes ("").
 * @param {string} text
 * @param {string} sep
 * @returns {string[][]} Zeilen mit Zellen
 */
function parseCsv(text, sep) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cur); cur = '';
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else if (ch === '\r') {
      // \r\n: das \n erledigt den Zeilenumbruch; einzelnes \r ignorieren
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

function escapeCsvCell(value) {
  let text = String(value ?? '');
  // Formel-Injection verhindern: Zellen, die mit einem Steuerzeichen beginnen,
  // mit einem führenden Apostroph entschärfen (Excel/LibreOffice/Sheets).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

module.exports = router;
