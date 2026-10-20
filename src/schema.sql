-- Dealvo datubāzes struktūra (SQLite)

-- Viens ieraksts = viens sludinājums no vienas vietnes
CREATE TABLE IF NOT EXISTS listings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT    NOT NULL,          -- 'ss.lv', 'autoscout24', 'mobile.de', 'demo-…'
  external_id   TEXT    NOT NULL,          -- sludinājuma ID vietnē
  url           TEXT,
  title         TEXT,
  make          TEXT    NOT NULL,          -- marka, kā vietnē
  model         TEXT,                      -- modelis, kā vietnē ("320d", "Golf VII")
  make_norm     TEXT    NOT NULL,          -- vienādota marka ("Mercedes")
  model_norm    TEXT,                      -- vienādots modelis ("320", "Golf")
  year          INTEGER NOT NULL,
  engine        REAL,
  fuel          TEXT,
  body          TEXT,
  gearbox       TEXT,
  color         TEXT,
  mileage       INTEGER,
  price         INTEGER NOT NULL CHECK (price > 0),
  image         TEXT,
  thumb         TEXT,
  country       TEXT,
  seller_type   TEXT,                      -- 'dīleris' / 'privātpersona'
  seller_name   TEXT,                      -- tikai dīleriem (uzņēmums)
  seller_city   TEXT,
  details       TEXT,                      -- sludinājuma lapas detaļas (JSON), ielādē pēc pieprasījuma
  details_at    TEXT,
  first_seen    TEXT    NOT NULL,
  last_seen     TEXT    NOT NULL,
  UNIQUE (source, external_id)
);

-- Cenu vēsture: katru reizi, kad sludinājuma cena mainās, vecā cena tiek saglabāta šeit
CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price       INTEGER NOT NULL,
  seen_at     TEXT    NOT NULL
);

-- Indeksi biežākajiem filtriem
CREATE INDEX IF NOT EXISTS idx_listings_model     ON listings (make_norm, model_norm);
CREATE INDEX IF NOT EXISTS idx_listings_price     ON listings (price);
CREATE INDEX IF NOT EXISTS idx_listings_year      ON listings (year);
CREATE INDEX IF NOT EXISTS idx_listings_last_seen ON listings (last_seen);
CREATE INDEX IF NOT EXISTS idx_history_listing    ON price_history (listing_id);
