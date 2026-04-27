-- Up Migration
-- MES core entities (projects, modules, parts, WO, vb.) bu schema'da yaşar.
-- integration schema'sı (events outbox) ayrı; modüller kendi schema'sına yazar
-- prensibi modular monolith disiplinini DB seviyesinde de korur.
CREATE SCHEMA IF NOT EXISTS mes;

COMMENT ON SCHEMA mes IS 'FactoryOS MES core — projects, modules, parts, work orders';

-- Down Migration
-- RESTRICT (default): schema içi obje varsa drop'lamaz, kazara veri silmeyi önler.
-- Tabloları temizlemek için sıralı down migration'ları çalıştırılmalı.
DROP SCHEMA mes;
