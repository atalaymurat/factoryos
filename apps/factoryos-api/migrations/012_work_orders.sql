-- Up Migration

-- WO öncelik — supervisor planlamada kullanır.
CREATE TYPE mes.wo_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- WO durumu — OPEN/CLOSED basit ikili. Detaylı durum (in_progress, etc.)
-- parts.current_status üzerinden agregeli olarak türetilir.
CREATE TYPE mes.wo_status AS ENUM ('open', 'closed');

-- İş emri — bir WO birden fazla projeyi kapsayabilir (supervisor birleştirme).
-- supervisor_id Faz 2'de eklenecek (operators tablosu sonradan).
CREATE TABLE mes.work_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- code: insan-okunur (ör. "WO-2026-0424-001"). Global unique.
  code                TEXT NOT NULL UNIQUE,

  -- Birden fazla projeyi kapsayabilir. Array — FK constraint elemana uygulanmaz,
  -- uygulama (parser) project'lerin var olduğunu doğrular.
  project_ids         UUID[] NOT NULL DEFAULT '{}',

  customer_name       TEXT,
  priority            mes.wo_priority NOT NULL DEFAULT 'normal',
  planned_start_date  DATE,
  planned_end_date    DATE,
  status              mes.wo_status NOT NULL DEFAULT 'open',
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT work_orders_code_not_blank CHECK (length(trim(code)) > 0),
  -- end >= start (ikisi de doluysa) — tutarsız tarihleri DB'de engelle.
  CONSTRAINT work_orders_dates_consistent CHECK (
    planned_start_date IS NULL
    OR planned_end_date IS NULL
    OR planned_end_date >= planned_start_date
  )
);

-- Dashboard'da "open WO'lar" en sık sorgu.
CREATE INDEX work_orders_status_idx ON mes.work_orders (status);

COMMENT ON TABLE mes.work_orders IS 'İş emirleri — supervisor''ın oluşturduğu üst-seviye plan birimi';
COMMENT ON COLUMN mes.work_orders.project_ids IS 'Birden fazla proje kapsayabilir (WO birleştirme); FK constraint array elemana uygulanmaz';

-- Down Migration
DROP TABLE mes.work_orders;
DROP TYPE mes.wo_status;
DROP TYPE mes.wo_priority;
