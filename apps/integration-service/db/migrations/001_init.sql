-- FactoryOS Integration Service - Outbox Schema (Initial)
-- Yeni ortamda sıfırdan kurulum için.
-- Mevcut ortamda IF NOT EXISTS ile no-op olur.

CREATE TABLE IF NOT EXISTS events (
  id               UUID PRIMARY KEY,
  type             VARCHAR(255) NOT NULL,
  source           VARCHAR(100) NOT NULL,
  topic            VARCHAR(255) NOT NULL,
  payload          JSONB NOT NULL,
  status           VARCHAR(50) NOT NULL DEFAULT 'pending',
  attempts         INT NOT NULL DEFAULT 0,
  error_message    TEXT,
  idempotency_key  TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at     TIMESTAMPTZ
);

-- Status sadece bilinen değerleri alabilir
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'published', 'failed'));

-- Worker query'si için partial index (sadece pending satırları indeksler)
CREATE INDEX IF NOT EXISTS idx_events_pending
  ON events (created_at)
  WHERE status = 'pending';

-- Payload üzerinden sorgu için (debug/audit: WO-001'in event geçmişi vs.)
CREATE INDEX IF NOT EXISTS idx_events_payload_gin
  ON events USING GIN (payload);