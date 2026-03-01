# MediaDock

> Self-hosted media collection manager – Home Assistant Add-on

Manage your vinyl records, CDs, games, Blu-rays and other media directly from
Home Assistant. Cover art and metadata are fetched automatically from
**MusicBrainz** and the **Cover Art Archive**.

---

## Features

- **Catalogue everything** – vinyl, CD, game, Blu-ray, DVD, book, and more
- **Automatic metadata enrichment** via MusicBrainz API
- **Automatic cover art** via Cover Art Archive
- **Filter** by media type, owned status, or wish-list
- **Persistent storage** – SQLite database in Home Assistant's `/data` volume
- **Home Assistant ingress** – accessible directly in the sidebar
- Runs entirely offline after metadata is fetched

---

## Installation

### 1. Add this repository to Home Assistant

1. Open **Home Assistant** → Settings → Add-ons → Add-on Store
2. Click the **⋮** (three-dot menu) in the top-right corner
3. Select **Repositories**
4. Add the URL of this repository, e.g.:
   ```
   https://github.com/YOUR_GITHUB_USERNAME/MediaDock
   ```
5. Click **Add → Close**

### 2. Install the add-on

1. Scroll down to find **MediaDock** in the store
2. Click it → **Install**
3. Wait for the image to build/download

### 3. Start the add-on

1. Go to the **MediaDock** add-on page
2. Click **Start**
3. Enable **Show in sidebar** for quick access
4. The app is accessible via the sidebar, or at:
   ```
   http://<your-ha-ip>:8099/
   ```

---

## Local development (without Home Assistant)

```bash
cd media-collection-addon/app
npm install
DB_PATH=./data/collection.db PORT=8099 npm start
```

Then open <http://localhost:8099>.

---

## Repository structure

```
MediaDock/
├── repository.json              # HA add-on repository manifest
├── README.md                    # This file
└── media-collection-addon/
    ├── config.json              # Add-on configuration
    ├── Dockerfile               # Container definition
    ├── run.sh                   # Container entry-point
    ├── README.md                # Add-on-specific docs
    └── app/
        ├── package.json
        ├── server.js            # Express app entry-point
        ├── database.js          # SQLite wrapper (better-sqlite3)
        ├── musicbrainz.js       # MusicBrainz + Cover Art Archive helpers
        ├── routes/
        │   ├── index.js         # Collection overview
        │   ├── items.js         # Add / detail / update / delete
        │   └── api.js           # JSON search endpoint
        ├── views/
        │   ├── index.ejs
        │   ├── add.ejs
        │   ├── detail.ejs
        │   └── error.ejs
        └── public/
            └── style.css
```

---

## Data storage

The SQLite database is stored at `/data/collection.db` inside the container,
which is mapped to Home Assistant's persistent add-on data directory.
Your collection survives add-on updates and Home Assistant restarts.

---

## Credits

- Metadata: [MusicBrainz](https://musicbrainz.org) (CC0)
- Cover art: [Cover Art Archive](https://coverartarchive.org) (CC BY-SA / CC0)

Both services are free and open-source. Please respect their rate-limits.
