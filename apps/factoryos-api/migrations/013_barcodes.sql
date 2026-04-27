-- Up Migration

-- 8 seviye barkod hiyerarşisi (rakip MES'lerde çözülmemiş problem):
-- part → pallet → lot → sub_module → module → group → project → shipment
CREATE TYPE mes.barcode_type AS ENUM (
  'part',
  'pallet',
  'lot',
  'sub_module',
  'module',
  'group',
  'project',
  'shipment'
);

-- Self-referencing tree — recursive CTE ile parent ve child arama yapılır.
-- Bir barkod tarandığında üstündeki ve altındaki tüm hiyerarşi döner.
CREATE TABLE mes.barcodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fiziksel olarak tekil — aynı barkod metni iki kez kayıt olamaz.
  code        TEXT NOT NULL UNIQUE,
  type        mes.barcode_type NOT NULL,

  -- ON DELETE SET NULL: parent silinince child orphan olur ama veri korunur.
  -- Audit disiplini — barkod tarihçesi yok edilmez (HANDOFF "veri kaybedilmemeli").
  -- Tree bozulursa manuel düzeltilir.
  parent_id   UUID REFERENCES mes.barcodes(id) ON DELETE SET NULL,

  -- Polymorphic referans — tip'e göre hangi tabloyu işaret ettiği bilinir.
  -- (parts, modules, sub_modules, pallets, lots, projects, ...). Postgres
  -- polymorphic FK desteklemez; uygulama tutarlılığı korur.
  source_ref  UUID NOT NULL,

  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT barcodes_code_not_blank CHECK (length(trim(code)) > 0)
);

-- Recursive CTE traversal için zorunlu.
CREATE INDEX barcodes_parent_id_idx ON mes.barcodes (parent_id);

-- Entity → barkod lookup (ör. "bu parçanın barkodu nedir?").
CREATE INDEX barcodes_source_ref_idx ON mes.barcodes (source_ref);

-- Tip bazlı filtreleme (ör. tüm pallet barkodları).
CREATE INDEX barcodes_type_idx ON mes.barcodes (type);

COMMENT ON TABLE mes.barcodes IS 'Hiyerarşik barkod ağacı — part → pallet → lot → ... → shipment';
COMMENT ON COLUMN mes.barcodes.source_ref IS 'Polymorphic — type''a göre parts/modules/pallets/... tablosuna referans (FK yok)';

-- Down Migration
DROP TABLE mes.barcodes;
DROP TYPE mes.barcode_type;
