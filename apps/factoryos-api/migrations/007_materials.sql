-- Up Migration

-- IMOS'tan gelen malzeme kayıtları. Üretim parçaları (parts.material_id) buraya
-- referans verir. Top-level entity — tedarikçi/fiyat bilgisi burada yaşar.
CREATE TABLE mes.materials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- code: malzeme kodu (ör. "MEL_White_19"). Global unique.
  code              TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL,                       -- ör. "Melamine, PB, White, G2S, 3/4"
  description_long  TEXT,                                -- ör. "PB19_Melamin_White"

  -- Esnek string — IMOS farklı kategoriler verebilir (Particle board, MDF, vb.).
  -- Enum dayatmıyoruz, module_type ile aynı disiplin.
  category          TEXT,

  thickness_mm      NUMERIC,                             -- nullable, dolu ise > 0
  grain             BOOLEAN NOT NULL DEFAULT FALSE,      -- IMOS gelmezse grain yok varsayımı

  -- { name, purchase_order_number, price_per_sheet } — esnek şema, parser doğrular
  supplier          JSONB NOT NULL DEFAULT '{}',
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT materials_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT materials_description_not_blank CHECK (length(trim(description)) > 0),
  -- thickness_mm null OR pozitif — sıfır/negatif kalınlık fiziksel anlamsız
  CONSTRAINT materials_thickness_positive CHECK (thickness_mm IS NULL OR thickness_mm > 0)
);

-- Dashboard'da "tüm Particle board'lar" filtresi için.
CREATE INDEX materials_category_idx ON mes.materials (category);

COMMENT ON TABLE mes.materials IS 'Üretim malzemeleri — IMOS adapter''ından veya manuel; parts.material_id referans verir';

-- Down Migration
DROP TABLE mes.materials;
