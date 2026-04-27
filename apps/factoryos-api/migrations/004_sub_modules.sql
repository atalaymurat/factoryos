-- Up Migration

-- IMOS "Assembly" karşılığı: üretim parçası + bağlı hardware grubu.
-- Örn. "Sağ yan panel + 2 menteşe plakası" — montaja birlikte gider.
-- Kit-based montaj: operatör tek palette panel+hardware'i alır.
CREATE TABLE mes.sub_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Modül silinince sub_module'lar da silinsin (modules-projects deseniyle aynı).
  module_id   UUID NOT NULL REFERENCES mes.modules(id) ON DELETE CASCADE,

  -- code: modül içinde unique. IMOS Assembly kodu (gelirse) veya manuel.
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,

  -- Modül içindeki sırası — IMOS'tan gelmezse 0, manuel düzeltilebilir.
  sequence    INT NOT NULL DEFAULT 0,

  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sub_modules_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT sub_modules_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT sub_modules_sequence_non_negative CHECK (sequence >= 0),
  CONSTRAINT sub_modules_code_unique_in_module UNIQUE (module_id, code)
);

-- Modül altındaki sub_module listelemesi sık.
CREATE INDEX sub_modules_module_id_idx ON mes.sub_modules (module_id);

COMMENT ON TABLE mes.sub_modules IS 'IMOS "Assembly" karşılığı — modül altındaki kit grupları (panel+hardware)';

-- Down Migration
DROP TABLE mes.sub_modules;
