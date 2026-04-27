-- Up Migration

-- Kenar bandı tanımları — parts'ın kenarlarına uygulanır (part_edges üzerinden).
-- materials gibi top-level entity; tedarikçi/fiyat bilgisi burada.
CREATE TABLE mes.edge_bands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- code: bant kodu (ör. "ABS_Oak_1p2"). Global unique.
  code          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL,                       -- ör. "ABS Oak 1.2"

  material      TEXT,                                -- ör. "ABS", "PVC"
  color         TEXT,                                -- ör. "Oak", "White"
  thickness_mm  NUMERIC,                             -- nullable, dolu ise > 0
  geometry      TEXT,                                -- IMOS geometry kodu, ör. "PG_RTB0p5"

  supplier      JSONB NOT NULL DEFAULT '{}',         -- { name, purchase_order_number, price }
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT edge_bands_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT edge_bands_description_not_blank CHECK (length(trim(description)) > 0),
  CONSTRAINT edge_bands_thickness_positive CHECK (thickness_mm IS NULL OR thickness_mm > 0)
);

COMMENT ON TABLE mes.edge_bands IS 'Kenar bandı kataloğu — IMOS''tan veya manuel; part_edges referans verir';

-- Down Migration
DROP TABLE mes.edge_bands;
