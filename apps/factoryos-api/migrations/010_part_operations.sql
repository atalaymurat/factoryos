-- Up Migration

-- Operasyon runtime durumu — pending → in_progress → done | skipped | failed.
CREATE TYPE mes.operation_status AS ENUM (
  'pending',
  'in_progress',
  'done',
  'skipped',
  'failed'
);

-- Parçanın rota adımları. Part'tan ayrı tablo — query esnek + history tutulur.
-- operator_id, session_id Faz 2'de eklenecek (operators/sessions tabloları sonradan).
CREATE TABLE mes.part_operations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  part_id                  UUID NOT NULL REFERENCES mes.parts(id) ON DELETE CASCADE,

  -- Operasyon sırası — 1'den başlar, parça içinde unique.
  sequence                 INT NOT NULL,

  -- Faz: 1=preparation (kesim/bantlama/cnc), 2=assembly, 3=packaging.
  phase                    INT NOT NULL,

  -- station enum — stations.station_type ile aynı tipi re-use ediyoruz.
  station                  mes.station_type NOT NULL,

  -- Routing (CAD'den gelen öneri + runtime atama)
  preferred_machine_id     UUID REFERENCES mes.machines(id) ON DELETE SET NULL,

  -- MVP'de boş; advanced routing flex'te dolar. Array — FK constraint Postgres'te
  -- array elemanına uygulanmaz, uygulama doğrular.
  alternative_machine_ids  UUID[] NOT NULL DEFAULT '{}',
  required_capabilities    TEXT[] NOT NULL DEFAULT '{}',

  -- Runtime: operasyon hangi makinede gerçekten yapıldı.
  actual_machine_id        UUID REFERENCES mes.machines(id) ON DELETE SET NULL,

  -- false ise atlanabilir — supervisor kararı.
  required                 BOOLEAN NOT NULL DEFAULT TRUE,

  -- Station-specific: { program_file, sides, program_path, ... }
  details                  JSONB NOT NULL DEFAULT '{}',

  status                   mes.operation_status NOT NULL DEFAULT 'pending',
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT part_operations_sequence_positive CHECK (sequence >= 1),
  CONSTRAINT part_operations_phase_range CHECK (phase BETWEEN 1 AND 3),
  -- completed_at ancak started_at doluysa ve sonra olabilir — veri bütünlüğü.
  CONSTRAINT part_operations_completed_after_started CHECK (
    completed_at IS NULL
    OR (started_at IS NOT NULL AND completed_at >= started_at)
  ),
  CONSTRAINT part_operations_sequence_unique_in_part UNIQUE (part_id, sequence)
);

-- Parçanın operasyon listesi (UI: WO detail page).
CREATE INDEX part_operations_part_id_idx ON mes.part_operations (part_id);

-- Dashboard: pending/in_progress sayıları, durum bazlı filtreleme.
CREATE INDEX part_operations_status_idx ON mes.part_operations (status);

-- Runtime: bu makinede çalışan operasyonlar (operatör ekranı).
CREATE INDEX part_operations_actual_machine_id_idx ON mes.part_operations (actual_machine_id);

COMMENT ON TABLE mes.part_operations IS 'Parça rota adımları — Faz 2''de operator_id/session_id eklenecek';

-- Down Migration
DROP TABLE mes.part_operations;
DROP TYPE mes.operation_status;
