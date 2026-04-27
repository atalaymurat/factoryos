-- Up Migration

-- IMOS EdgeTrim L/S — uzun kenar / kısa kenar.
CREATE TYPE mes.edge_side AS ENUM ('long_edge', 'short_edge');

-- Parçanın hangi kenarına hangi bant — many-to-many ilişki tablosu.
-- IMOS export'unda EdgeSequence 1-4 (4 kenar) gelir; modelimiz daha esnek.
CREATE TABLE mes.part_edges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  part_id          UUID NOT NULL REFERENCES mes.parts(id) ON DELETE CASCADE,

  -- RESTRICT (default): kullanılan kenar bandı silinemez (materials paterni).
  edge_band_id     UUID NOT NULL REFERENCES mes.edge_bands(id),

  -- IMOS EdgeSequence (1-4 tipik, esnek bırakıldı).
  sequence         INT NOT NULL,
  side             mes.edge_side NOT NULL,

  -- Bantlama makinesinde işlenen kenar sayısı (0 = sadece bant uygulandı).
  machining_sides  INT NOT NULL DEFAULT 0,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT part_edges_sequence_positive CHECK (sequence >= 1),
  CONSTRAINT part_edges_machining_sides_non_negative CHECK (machining_sides >= 0),
  CONSTRAINT part_edges_sequence_unique_in_part UNIQUE (part_id, sequence)
);

-- Parçanın kenar bant listesi (UI: part detail).
CREATE INDEX part_edges_part_id_idx ON mes.part_edges (part_id);

COMMENT ON TABLE mes.part_edges IS 'Parça-kenar bandı ilişkisi — IMOS EdgeSequence ile uyumlu';

-- Down Migration
DROP TABLE mes.part_edges;
DROP TYPE mes.edge_side;
