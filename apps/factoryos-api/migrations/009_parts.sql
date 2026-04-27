-- Up Migration

-- Üretim parçası ve satınalma parçası tek tabloda — part_type ile ayırt edilir.
-- Domain-model-v2.md kararı: ortak alanlar fazla, ayrı tablo overhead'i değerli değil.
CREATE TYPE mes.part_type AS ENUM (
  'manufactured',      -- içeride üretilir
  'purchased_stock',   -- hardware: vida, menteşe, ray
  'purchased_custom',  -- özel sipariş (membran kapak) — MVP sonrası
  'external'           -- dışarıda üretildi — MVP sonrası
);

-- Runtime durumu — operatör ekranı ve dashboard'da görünür.
CREATE TYPE mes.part_status AS ENUM (
  'pending',
  'at_station',
  'in_progress',
  'done_at_station',
  'completed',
  'scrapped',
  'rework'
);

CREATE TABLE mes.parts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalize: code'un proje içinde unique olmasını DB seviyesinde zorlamak için.
  -- Uygulama (parser) doldurur; module.project_id ile senkron olmalı.
  project_id                  UUID NOT NULL REFERENCES mes.projects(id) ON DELETE CASCADE,

  module_id                   UUID NOT NULL REFERENCES mes.modules(id) ON DELETE CASCADE,

  -- Bazı parçalar direkt modüle bağlı olabilir (sub_module yoksa).
  sub_module_id               UUID REFERENCES mes.sub_modules(id) ON DELETE CASCADE,

  -- code: proje içinde unique. CAD'den (IMOS) gelir veya manuel.
  code                        TEXT NOT NULL,
  article_number              TEXT,                       -- CAD adı, ör. "Gable Right"
  description                 TEXT,

  part_type                   mes.part_type NOT NULL,

  -- Modül/sub_module içinde bu parçadan kaç tane.
  quantity                    INT NOT NULL DEFAULT 1,

  -- { primary: "1135", operation_barcodes: [...] } — IMOS multi-barcode desteği
  barcodes                    JSONB NOT NULL DEFAULT '{}',

  -- { cutting: { length_mm, width_mm, ... }, final: {...} } — manufactured için
  dimensions                  JSONB NOT NULL DEFAULT '{}',

  -- Manufactured parçalar için. Referansı olan malzeme silinemez (RESTRICT).
  material_id                 UUID REFERENCES mes.materials(id),

  -- 0, 90, ... — yön açısı, manufactured için anlamlı
  grain_orientation_degrees   NUMERIC,

  -- Purchased parçalar için: { name, part_code, purchase_order_ref, price }
  supplier                    JSONB NOT NULL DEFAULT '{}',

  -- { cut: bool, cnc: bool, include_in_bom: bool } — operasyon flag'leri
  flags                       JSONB NOT NULL DEFAULT '{}',

  -- Runtime alanları
  -- İstasyon silinirse parça orphan olmasın (SET NULL).
  current_station_id          UUID REFERENCES mes.stations(id) ON DELETE SET NULL,
  current_status              mes.part_status NOT NULL DEFAULT 'pending',

  metadata                    JSONB NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT parts_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT parts_quantity_positive CHECK (quantity > 0),
  CONSTRAINT parts_grain_orientation_range CHECK (
    grain_orientation_degrees IS NULL
    OR (grain_orientation_degrees >= 0 AND grain_orientation_degrees < 360)
  ),
  CONSTRAINT parts_code_unique_in_project UNIQUE (project_id, code)
);

-- Modül altındaki parça listesi en sık kullanılan sorgu.
CREATE INDEX parts_module_id_idx ON mes.parts (module_id);

-- Operatör ekranı: "bu istasyondaki parçalar".
CREATE INDEX parts_current_station_id_idx ON mes.parts (current_station_id);

-- Dashboard: pending/in_progress sayıları.
CREATE INDEX parts_current_status_idx ON mes.parts (current_status);

COMMENT ON TABLE mes.parts IS 'Üretim ve satınalma parçaları — part_type ile ayrılır; runtime durumu burada izlenir';
COMMENT ON COLUMN mes.parts.project_id IS 'Denormalize — UNIQUE(project_id, code) için; module.project_id ile senkron tutulmalı';

-- Down Migration
DROP TABLE mes.parts;
DROP TYPE mes.part_status;
DROP TYPE mes.part_type;
