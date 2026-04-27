-- Up Migration

-- Fiziksel iş bölümleri — kesim, bantlama, CNC, montaj, paketleme.
-- MVP'de 5 tip; advanced'te paralel hatlar (main_assembly, small_parts) gelebilir.
CREATE TYPE mes.station_type AS ENUM (
  'cutting',
  'banding',
  'cnc',
  'assembly',
  'packaging'
);

CREATE TABLE mes.stations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- code: insan-okunur, ör. "STA-CUTTING-01". Global unique.
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  station_type   mes.station_type NOT NULL,

  -- UI'da istasyon sıralaması (operatör akışı: 1=cutting, 5=packaging).
  display_order  INT NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT stations_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT stations_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT stations_display_order_non_negative CHECK (display_order >= 0)
);

COMMENT ON TABLE mes.stations IS 'Fiziksel iş istasyonları — kesim, bantlama, CNC, montaj, paketleme';

-- Down Migration
DROP TABLE mes.stations;
DROP TYPE mes.station_type;
