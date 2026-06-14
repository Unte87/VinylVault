'use strict';

/**
 * database.js
 * Thin wrapper around better-sqlite3.
 * The DB file is stored in /data/collection.db (mapped as persistent
 * storage in the Home Assistant add-on config).
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'collection.db');

let db;

/**
 * Initialise the database connection and create tables if they don't exist.
 */
function init() {
  db = new Database(DB_PATH, { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined });

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      artist      TEXT,
      year        TEXT,
      media_type  TEXT    NOT NULL DEFAULT 'vinyl',
      owned       INTEGER NOT NULL DEFAULT 0,
      wishlist    INTEGER NOT NULL DEFAULT 0,
      rating      INTEGER NOT NULL DEFAULT 0,  -- 0 = unbewertet, 1-5 Sterne
      genre       TEXT,
      notes       TEXT,
      cover_url   TEXT,
      mbid        TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrationen für bestehende Datenbanken. Nur "Spalte existiert bereits"
  // ignorieren – echte Fehler (z.B. Schreibrechte, volle Platte) durchreichen.
  addColumnIfMissing('rating INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('genre TEXT');

  console.log(`Datenbank initialisiert: ${DB_PATH}`);
}

/**
 * Fügt eine Spalte hinzu, falls sie noch nicht existiert. Andere Fehler als
 * "duplicate column" werden weitergereicht, damit echte Probleme auffallen.
 * @param {string} columnDef z.B. "genre TEXT"
 */
function addColumnIfMissing(columnDef) {
  try {
    db.exec(`ALTER TABLE items ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

/** Return the raw better-sqlite3 instance (for advanced use). */
function getDb() {
  if (!db) throw new Error('Datenbank nicht initialisiert. Bitte zuerst init() aufrufen.');
  return db;
}

// ── Items CRUD ────────────────────────────────────────────────────────────────

/**
 * Fetch all items, optionally filtered by media_type and/or wishlist/owned.
 * @param {object} filters  { media_type?, status? } where status = 'owned'|'wishlist'|undefined
 */
function getAllItems(filters = {}) {
  let query = 'SELECT * FROM items WHERE 1=1';
  const params = [];

  if (filters.media_type && filters.media_type !== 'all') {
    query += ' AND media_type = ?';
    params.push(filters.media_type);
  }

  if (filters.status === 'owned') {
    query += ' AND owned = 1';
  } else if (filters.status === 'wishlist') {
    query += ' AND wishlist = 1';
  }

  query += ' ORDER BY created_at DESC';
  return db.prepare(query).all(...params);
}

/**
 * Fetch a single item by ID.
 * @param {number} id
 */
function getItemById(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

/**
 * Insert a new item and return the created row.
 * @param {object} data
 */
function createItem(data) {
  const stmt = db.prepare(`
    INSERT INTO items (title, artist, year, media_type, owned, wishlist, rating, genre, notes, cover_url, mbid)
    VALUES (@title, @artist, @year, @media_type, @owned, @wishlist, @rating, @genre, @notes, @cover_url, @mbid)
  `);

  const result = stmt.run({
    title: data.title || '',
    artist: data.artist || '',
    year: data.year || '',
    media_type: data.media_type || 'vinyl',
    owned: data.owned ? 1 : 0,
    wishlist: data.wishlist ? 1 : 0,
    rating: Number(data.rating) || 0,
    genre: data.genre || '',
    notes: data.notes || '',
    cover_url: data.cover_url || '',
    mbid: data.mbid || '',
  });

  return getItemById(result.lastInsertRowid);
}

/**
 * Update an existing item. Only the supplied fields are changed.
 * @param {number} id
 * @param {object} data
 */
function updateItem(id, data) {
  const allowed = ['title', 'artist', 'year', 'media_type', 'owned', 'wishlist', 'rating', 'genre', 'notes', 'cover_url', 'mbid'];
  // undefined-Werte ignorieren (kein Überschreiben mit NULL)
  const fields = Object.keys(data).filter((k) => allowed.includes(k) && data[k] !== undefined);

  if (fields.length === 0) return getItemById(id);

  const setClause = fields.map((f) => `${f} = @${f}`).join(', ');
  const params = { id };
  for (const f of fields) {
    params[f] = data[f];
  }

  db.prepare(`UPDATE items SET ${setClause} WHERE id = @id`).run(params);
  return getItemById(id);
}

/**
 * Delete an item by ID.
 * @param {number} id
 */
function deleteItem(id) {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

/**
 * Delete multiple items by ID in a single transaction.
 * @param {number[]} ids
 */
function deleteItems(ids) {
  if (!ids || ids.length === 0) return;
  const del = db.prepare('DELETE FROM items WHERE id = ?');
  const tx  = db.transaction((list) => { for (const id of list) del.run(id); });
  tx(ids.map(Number));
}

module.exports = { init, getDb, getAllItems, getItemById, createItem, updateItem, deleteItem, deleteItems, getKnownIdentifiers };

/**
 * Gibt alle bekannten MBIDs + Titel+Künstler zurück (für Duplikat-Erkennung im Frontend).
 * @returns {Array<{mbid: string, title: string, artist: string}>}
 */
function getKnownIdentifiers() {
  return db.prepare('SELECT mbid, title, artist FROM items').all();
}
