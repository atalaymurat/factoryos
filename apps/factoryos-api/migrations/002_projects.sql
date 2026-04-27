-- Up Migration

-- Proje kategorisi — UI'da segment ve şablon seçiminde kullanılır.
-- Yeni kategori eklemek migration gerektirir; nadir değişen kapalı liste.
CREATE TYPE mes.project_type AS ENUM (
  'kitchen',
  'bathroom',
  'wardrobe',
  'shop',
  'other'
);

CREATE TABLE mes.projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- code: insan-okunur (ör. MUT-001), barkod ve UI'da görünür.
  -- Global unique — proje kodları her zaman ayrı.
  code              TEXT NOT NULL UNIQUE,

  name              TEXT NOT NULL,
  type              mes.project_type NOT NULL,

  -- Müşteri bilgisi IMOS export'unda her zaman gelmez; manuel girilebilir.
  customer_name     TEXT,
  customer_address  TEXT,

  -- IMOS/CAD kaynak sisteminin ek alanları (esnek şema).
  -- DEFAULT '{}' → query'lerde null check gerekmez.
  metadata          JSONB NOT NULL DEFAULT '{}',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Boş string ve sadece-boşluk kayıt önlenir; "" veya "   " kod kabul edilmez.
  CONSTRAINT projects_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT projects_name_not_blank CHECK (length(trim(name)) > 0)
);

-- Dashboard'da "tüm mutfak projeleri" filtresi için.
CREATE INDEX projects_type_idx ON mes.projects (type);

COMMENT ON TABLE mes.projects IS 'Müşteri projeleri (mutfak, banyo, vb.) — IMOS adapter''ından veya manuel açılır';
COMMENT ON COLUMN mes.projects.code IS 'İnsan-okunur kod, ör. MUT-001 — UI ve barkodda görünür';
COMMENT ON COLUMN mes.projects.metadata IS 'Kaynak sistem (IMOS) ek alanları — esnek şema';

-- Down Migration
DROP TABLE mes.projects;
DROP TYPE mes.project_type;
