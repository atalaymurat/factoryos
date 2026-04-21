# FactoryOS

FactoryOS, üretim işletmeleri için geliştirilen modüler, event-driven bir endüstriyel platform altyapısıdır.

Amaç:
ERP, MES, IoT ve diğer sistemleri MQTT (UNS) üzerinden birbirine bağlayan,
ölçeklenebilir ve sahada çalışabilir bir core platform oluşturmaktır.

---

## 🚀 Mimari

FactoryOS aşağıdaki temel bileşenlerden oluşur:

- ERP (ERPNext / diğer ERP sistemleri)
- Integration Layer (Adapter + Event Processing)
- MQTT Broker (UNS)
- PostgreSQL (Data Layer)
- Core API (gelecek)
- MES (gelecek)

---

## 🧱 Klasör Yapısı

🐳 Teknoloji Stack
Node.js
PostgreSQL
EMQX (MQTT Broker)
Docker
Redis (opsiyonel)
MinIO (opsiyonel)

🛣️ Roadmap
Faz 1
 ERP Adapter (ERPNext)
 Integration Service
 MQTT Setup
 PostgreSQL schema
Faz 2
 MES (Work Order)
 Production Tracking
 Cost Engine
Faz 3
 Machine Integration
 OEE
 AI Analysis

🎯 Amaç

FactoryOS:

ERP bağımlılığını azaltır
MES için temel oluşturur
UNS mimarisini uygular
On-premise çalışır
SaaS'a dönüşebilir

