-- Up Migration

-- Makine tipleri — fabrika makine envanterinin sınıflandırması.
-- "generic" manuel/sınıflandırılamayan istasyonlar için fallback.
CREATE TYPE mes.machine_type AS ENUM (
  'panel_saw',
  'edge_bander',
  'cnc_router',
  'cnc_drill',
  'manual_station',
  'generic'
);

-- Anlık durum — supervisor dashboard'unda görünür, routing kararlarını etkiler.
CREATE TYPE mes.machine_status AS ENUM (
  'available',
  'busy',
  'maintenance',
  'offline'
);

CREATE TABLE mes.machines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- code: CAD/CAM'de geçen ID (ör. "10303_BHX560"). Global unique.
  code          TEXT NOT NULL UNIQUE,
  model         TEXT,                                   -- ör. "BHX560"
  name          TEXT NOT NULL,                          -- insan-okunur, ör. "5-eksen CNC Router #1"

  -- ON DELETE RESTRICT (default): bağlı makinesi olan istasyon silinemez.
  -- Üretim disiplini — yanlışlıkla envanter koparılmasın.
  station_id    UUID NOT NULL REFERENCES mes.stations(id),

  machine_type  mes.machine_type NOT NULL,

  -- MVP'de boş; advanced routing flex'te ["grooving", "drilling", ...] dolar.
  capabilities  TEXT[] NOT NULL DEFAULT '{}',

  status        mes.machine_status NOT NULL DEFAULT 'available',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT machines_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT machines_name_not_blank CHECK (length(trim(name)) > 0)
);

-- İstasyon altındaki makineleri listelemek sık.
CREATE INDEX machines_station_id_idx ON mes.machines (station_id);

COMMENT ON TABLE mes.machines IS 'Fabrika makine envanteri — istasyon altında, capability ve status izlenir';

-- Down Migration
DROP TABLE mes.machines;
DROP TYPE mes.machine_status;
DROP TYPE mes.machine_type;
