-- Mevcut events tablosuna outbox pattern için eksik alanları ekler.
-- 001'i birlikte çalıştırırsan bu dosya sadece idempotent güvence sağlar.

-- 1. attempts kolonu (retry counter)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- 2. idempotency_key kolonu (duplicate webhook koruması)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- UNIQUE constraint'i ayrı statement — ADD COLUMN ile birleşince
-- mevcut NULL'larla çakışabilir. NULL'lar UNIQUE'te sorun değil ama
-- constraint'i ayrı eklemek daha temiz.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_idempotency_key_key'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_idempotency_key_key
      UNIQUE (idempotency_key);
  END IF;
END $$;

-- 3. status CHECK constraint
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'published', 'failed'));

-- 4. Partial index — worker performansı için kritik
CREATE INDEX IF NOT EXISTS idx_events_pending
  ON events (created_at)
  WHERE status = 'pending';

-- 5. GIN index (opsiyonel, payload sorguları için)
CREATE INDEX IF NOT EXISTS idx_events_payload_gin
  ON events USING GIN (payload);