-- Up Migration

-- IMOS "Article" karşılığı: dolap, kapak, çekmece birimi gibi.
-- Modül = ürün ağacının orta seviyesi (project → module → sub_module → part).
CREATE TABLE mes.modules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE: proje silindiğinde içindeki modüller de silinir.
  -- Üretimde proje genelde "delete" değil "close" edilir; CASCADE temiz
  -- delete senaryosu (yanlış import, dev/test) için pratik bırakılıyor.
  project_id               UUID NOT NULL REFERENCES mes.projects(id) ON DELETE CASCADE,

  -- code: proje içinde unique. Aynı kod farklı projelerde olabilir.
  code                     TEXT NOT NULL,
  name                     TEXT NOT NULL,

  -- Esnek string — IMOS'tan farklı tipler gelir, enum dayatmıyoruz
  -- (domain-model-v2.md kararı). Index yok; dashboard filtresi gerekirse eklenir.
  module_type              TEXT,

  -- IMOS tasarım fazı bilgileri (üretim sırasında değişmez)
  article_number           TEXT,           -- IMOS Article kodu, ör. "W_BC_2D_R"
  construction_principle   TEXT,           -- IMOS ConstructionPrinciple meta

  -- Ölçü ve fiziksel özellikler
  dimensions               JSONB NOT NULL DEFAULT '{}',  -- { length_mm, width_mm, depth_mm }
  weight_kg                NUMERIC,

  -- IMOS ArticleInfo1=Assembled ise true. Bilinmiyorsa güvenli varsayım: sahada montajlanır.
  is_assembled_at_factory  BOOLEAN NOT NULL DEFAULT FALSE,

  -- UI'da modül kartında gösterilir
  images                   JSONB NOT NULL DEFAULT '[]',  -- [{ type, url }]

  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT modules_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT modules_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT modules_code_unique_in_project UNIQUE (project_id, code)
);

-- Modül listelerini projeye göre filtrelemek sık.
CREATE INDEX modules_project_id_idx ON mes.modules (project_id);

COMMENT ON TABLE mes.modules IS 'IMOS "Article" karşılığı — proje altındaki dolap/kapak/çekmece birimleri';
COMMENT ON COLUMN mes.modules.code IS 'Proje içinde unique modül kodu';
COMMENT ON COLUMN mes.modules.module_type IS 'Esnek tip (base_cabinet, wall_cabinet, vb.) — enum dayatılmadı';

-- Down Migration
DROP TABLE mes.modules;
