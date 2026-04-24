# FactoryOS — Domain Model v2 (MVP)

> **Durum:** MVP için donduruldu. Genişletmeler "Advanced" bölümünde roadmap olarak duruyor.
> **Tarih:** 2026-04-24
> **Önceki versiyon:** v1 (2026-04-23) — `docs/archive/domain-model-v1.md`
> **İlgili dokümanlar:** `part-contract-v2.md`, `adapters-reference.md`

---

## v1 → v2 Değişiklikleri

- ✅ **`sub_module` seviyesi eklendi** — IMOS'un "Assembly" seviyesine karşılık (üretim parçası + bağlı hardware grubu)
- ✅ **`machines` entity'si eklendi** — fabrika makine envanteri
- ✅ **Routing flexibility altyapısı hazırlandı** — `preferred_machine`, `alternative_machines`, `capabilities` alanları (MVP'de kullanılmaz)
- ✅ **Cutting vs Final dimensions ayrımı** — bantlama toleransı doğru modellenecek
- ✅ **Multi-barcode desteği** — ana barkod + operasyon bazlı NC barkodlar
- ✅ **`hardware` part tipi netleşti** — satınalma parçası için ayrı kavram (vida, menteşe, ray)
- ✅ **Material ve edge_band top-level entity oldu** — tedarikçi/fiyat bilgileri ile
- ✅ **Windows-Linux köprü kavramı eklendi** — CAD/CAM programları Windows'ta, FactoryOS Linux'ta

---

## Felsefe ve Prensipler

Tasarım sprintinden gelen temel ilkeler (v1'den korunuyor):

1. **Parça-merkezli model.** İş emri tek bir durum makinesi değil; parçaların durumlarından türeyen bir agregasyon.

2. **Üretim akışı parça/lot/palet bazlıdır.** Kesim, bantlama, CNC istasyonlarında farklı WO'ların parçaları karışık akabilir. Toplama sorter rolü görür.

3. **Montaj öncesi = "supplier" rolü.** Otomotiv prensibi: montaj hattı ana üretim noktasıdır, öncesi tedarikçi gibi çalışır.

4. **Concept separation.** MES, ERP'yi veya CAD yazılımını bilmez. Sadece UNS ve standart Part Contract üzerinden konuşur.

5. **Sistem akıllı olsun, dayatmasın.** Supervisor karar verir, sistem öneri sunar.

6. **"Operatör düşünmesin" prensibi.** Sistem önüne ne yapacağını, hangi parçayı, hangi palette, hangi sırayla koyar.

7. **Ürün odak:** Modüler mobilya (mutfak, banyo, gardırop, mağaza dekorasyonu).

8. **YENİ — IMOS kalibrasyon prensibi:** IMOS sektörün en eski ve en kapsamlı CAD/CAM'i. IMOS'un sağladığı veri zenginliğini **kapsam referansı** olarak kullanıyoruz. Ama **isimlendirme ve yapı bizim.** IMOS adapter çevirmendir.

---

## Veri Hiyerarşisi

### Ürün Yapısı (Product Structure)

IMOS/CAD'den gelen **statik** yapı. Tasarım aşamasında belirlenir, üretim boyunca değişmez.

```
project                   (MUT-001 = Ahmet'in mutfağı)
    └─ module             (D3 dolabı — IMOS "Article" karşılığı)
        └─ sub_module     (YENİ — Sağ yan panel + 2 menteşe plakası)
            ├─ parts[]    (üretim parçaları)
            └─ hardware[] (satınalma parçaları)
```

**Neden sub_module?**

IMOS'ta gördük: "Gable Right" bir assembly grubu = 1 üretim paneli + 2 menteşe plakası. Bu grup montaja birlikte gider. Bizim v1'de bu seviye yoktu, modülün altında direkt parça vardı.

Avantajları:
- **Kit-based montaj:** Operatör "sub_module kit'i getir" der, bir palette panel+hardware birlikte gelir
- **Otomotiv pattern'i:** "Sub-assembly" tam bu — kapı paneline önceden takılır
- **IMOS'la uyumlu:** Adapter doğrudan maps

### Üretim Akışı (Production Flow)

İçeride MES'in yönettiği **dinamik** yapı. Runtime'da oluşur.

```
lot           (homojen parça grubu — kesim çıkışı)
    ↓ palette konur
pallet        (fiziksel taşıyıcı — 1 metre istif limiti)
    ↓ istasyona gider
station       (iş istasyonu)
    ↓ operatör işler
session       (kim, ne zaman, ne kadar sürede)
    ↓ sonuç
production_record  (üretilen miktar, fire, kalite)
```

---

## İki Fazlı Süreç (Otomotiv Analojisi)

```
FAZ 1: PART PREPARATION (parça hazırlık — parça bazlı)
  • cutting          Kesim (Homag panel saw veya benzeri)
  • banding          Kenar bantlama
  • cnc              CNC (delik, kanal, freze)
  • (external)       Dış kaynaklı operasyonlar — MVP sonrası
  
  ↓ Toplama/Sorter noktası
  (parçalar WO'larına göre ayrılır, sub_module bazlı kit olur)

FAZ 2: ASSEMBLY (montaj — modül/sub_module bazlı)
  • assembly         Montaj
  • packaging        Paketleme (saha montaj talimatı dahil)

  ↓ Sevkiyat
  (saha montajı teslim yerinde tamamlanır)
```

### Hat kavramı (MVP sonrası)

MVP'de **tek hat**. Sadece istasyon tipleri var.

Advanced'de **paralel hatlar**:
- `main_assembly` (büyük dolaplar)
- `small_parts` (çekmece, baza)
- `custom_parts` (özel cam/alüminyum kapaklı)

Parçanın hangi hatta gideceği **supervisor kararı** (IMOS bilmez).

---

## Domain Entities — MVP Kapsamı

### projects

```
id                UUID
code              string   "MUT-001"
name              string   "Ahmet Yılmaz Mutfağı"
type              enum     kitchen | bathroom | wardrobe | shop | other
customer_name     string
customer_address  string   (teslim adresi)
metadata          jsonb    (kaynak sistem ek bilgileri)
created_at        timestamptz
```

### modules

IMOS "Article" karşılığı. Dolap, kapak, çekmece birimi gibi.

```
id                UUID
project_id        FK projects
code              string   unique in project
article_number    string   CAD sistemindeki kod ("W_BC_2D_R")
name              string   "Alt Dolap D3"
module_type       string   "base_cabinet_door", "wall_cabinet", ... (enum değil, esnek string)
construction_principle string  (IMOS ConstructionPrinciple — meta)
dimensions        jsonb    { length_mm, width_mm, depth_mm }
weight_kg         numeric
is_assembled_at_factory boolean  (IMOS ArticleInfo1=Assembled ise true)
images            jsonb    [{ type, url }]
metadata          jsonb
```

### sub_modules (YENİ)

IMOS "Assembly" karşılığı. Üretim parçası + bağlı hardware grubu.

```
id                UUID
module_id         FK modules
code              string   unique in module
name              string   "Sağ yan panel + menteşeler"
sequence          int      modül içindeki sırası
metadata          jsonb
```

**Örnek:** D3 dolabı içinde:
- Sub-module "Gable Right" = { 1 yan panel (part), 2 menteşe plakası (hardware) }
- Sub-module "Bottom Shelf" = { 1 alt raf (part), 8 vida (hardware) }
- Sub-module "Door Left" = { 1 kapak paneli (part), 2 menteşe (hardware) }

### parts

Üretim parçası + satınalma parçası birlikte, `part_type` ile ayırt edilir.

```
id                UUID
module_id         FK modules
sub_module_id     FK sub_modules  (nullable — bazı parçalar direkt modüle bağlı olabilir)
code              string   unique in project
article_number    string   CAD sistemindeki ad ("Gable Right", "HE_MP_H0_9071625")
description       string

part_type         enum:
                    - manufactured       (içeride üretilir)
                    - purchased_stock    (hardware: vida, menteşe, ray)
                    - purchased_custom   (özel sipariş: membran kapak — MVP sonrası)
                    - external           (dışarıda üretildi — MVP sonrası)

quantity          int     modül/sub_module içinde bu parçadan kaç tane
barcodes          jsonb   { primary, operation_barcodes: [] }
dimensions        jsonb   { cutting: {...}, final: {...} }  (manufactured için)
material_id       FK materials  (manufactured için, nullable)
grain_orientation_degrees numeric  (0, 90, ...)

supplier          jsonb   { name, part_code, purchase_order_ref, price }  (purchased için)

flags             jsonb   { cut, cnc, include_in_bom }
current_station_id FK stations  (runtime)
current_status    enum:
                    - pending              (henüz başlamadı)
                    - at_station           (istasyonda, sırada)
                    - in_progress          (şu an işleniyor)
                    - done_at_station      (bu istasyon bitti, sonrakine hazır)
                    - completed            (tüm rotayı tamamladı)
                    - scrapped             (fire)
                    - rework               (geri işleme)

metadata          jsonb   (source_id, checksum, vb.)
```

**Neden tek tablo?** IMOS analizinde gördük ki üretim parçası ve hardware aynı yapıda yaşıyor (ortak alanlar: code, quantity, module_id, operations). Ayrı tablolar yapmak yerine `part_type` enum'u ile ayırt ediyoruz. Query kolaylığı ve ilişki yönetimi tek yerden.

### part_operations

Her parçanın kendi rotası. Part'tan ayrı tablo — query flexible + history tutma.

```
id                UUID
part_id           FK parts
sequence          int      (1'den başlar)
phase             int      (1: preparation, 2: assembly, 3: packaging)
station           enum     (cutting, banding, cnc, assembly, packaging)

-- Routing (v1: sabit, v2: flexible)
preferred_machine_id    FK machines  (CAD'den gelen öneri)
alternative_machine_ids FK machines[]  (MVP'de boş, v2'de dolacak)
required_capabilities   text[]  (MVP'de boş, v2'de dolacak)
actual_machine_id       FK machines  (runtime — hangisine atandı)

required          boolean  (false ise atlanabilir)
details           jsonb    (station-specific: program_file, sides, program_path, ...)

-- Runtime state
status            enum (pending, in_progress, done, skipped, failed)
started_at        timestamptz
completed_at      timestamptz
operator_id       FK operators
session_id        FK sessions
```

**Phase-station ilişkisi (MVP):**

| Phase | Stations |
|---|---|
| 1 (preparation) | cutting, banding, cnc |
| 2 (assembly) | assembly |
| 3 (finishing) | packaging |

### machines (YENİ)

Fabrika makine envanteri.

```
id                UUID
code              string   "10303_BHX560"  (CAD/CAM'de geçen ID)
model             string   "BHX560"         (makine modeli)
name              string   "5-eksen CNC Router #1"
station_id        FK stations              (hangi istasyon altında)
machine_type      enum:
                    - panel_saw
                    - edge_bander
                    - cnc_router
                    - cnc_drill
                    - manual_station
                    - generic
capabilities      text[]   (MVP'de boş — v2'de: ["grooving", "drilling", ...])
status            enum     (available, busy, maintenance, offline)
metadata          jsonb    (vendor, purchase_date, ...)
```

**Neden machines ayrı entity?**

1. IMOS'ta gördük: aynı istasyonda birden fazla makine olabilir (2 panel saw, 3 edge bander)
2. Her makinenin farklı yetenekleri var (eski CNC vs yeni CNC)
3. Routing flexibility buna bağımlı — "bu parça BHX560'da veya MLK110'da işlenebilir"
4. Makine bakım/arıza durumu ileride önemli

### stations

İstasyon tanımları — fiziksel iş bölümleri.

```
id                UUID
code              string   "STA-CUTTING-01"
name              string   "Kesim"
station_type      enum     (cutting, banding, cnc, assembly, packaging)
display_order     int      (UI'da sıralama için)
```

MVP'de 5 istasyon: cutting, banding, cnc, assembly, packaging.

### materials

IMOS'tan gelen malzeme kayıtları. Üretim parçalarına referans verir.

```
id                UUID
code              string   "MEL_White_19"
description       string   "Melamine, PB, White, G2S, 3/4"
description_long  string   "PB19_Melamin_White"
category          string   "Particle board"
thickness_mm      numeric
grain             boolean
supplier          jsonb    { name, purchase_order_number, price_per_sheet }
metadata          jsonb
```

### edge_bands

Kenar bandı tanımları.

```
id                UUID
code              string   "ABS_Oak_1p2"
description       string   "ABS Oak 1.2"
material          string   "ABS"
color             string   "Oak"
thickness_mm      numeric
geometry          string   "PG_RTB0p5"
supplier          jsonb    { name, purchase_order_number, price }
metadata          jsonb
```

### part_edges

Parçanın hangi kenarına hangi bant — part ve edge_band arasındaki çoklu ilişki.

```
id                UUID
part_id           FK parts
edge_band_id      FK edge_bands
sequence          int      (IMOS EdgeSequence — 1, 2, 3, 4)
side              enum     (long_edge | short_edge — IMOS EdgeTrim L/S)
machining_sides   int      (default 0)
```

### machining_features (opsiyonel — MVP'de kullanılmıyor)

IMOS'tan gelen CNC geometrisi (delik, kanal, cep). Şimdilik metadata, ileride:
- Operatör ekranında parça önizlemesi
- Kalite kontrol
- Anomali tespiti

```
id                UUID
part_id           FK parts
feature_type      string   "groove", "drill_hole", "pocket"
position          jsonb    { x, y, z }
end_position      jsonb    { x, y, z }  (groove için)
dimensions        jsonb    { width_mm, depth_mm, diameter_mm }
machine_id        FK machines  (hangi makinede yapılacak)
metadata          jsonb
```

---

## Üretim Runtime Entities

### work_orders

```
id                UUID
code              string   "WO-2026-0424-001"
project_ids       UUID[]   (bir WO birden fazla proje içerebilir — supervisor birleştirme)
customer_name     string
priority          enum     (low, normal, high, urgent)
planned_start_date date
planned_end_date  date
status            enum     (OPEN | CLOSED)
supervisor_id     FK operators
notes             text
created_at        timestamptz
```

### lots

Kesimden doğal olarak oluşan homojen parça grubu.

```
id                UUID
code              string   "LOT-2026-0424-001"
type              enum     (homogeneous, mixed)
source_station_id FK stations  (hangi istasyondan çıktı)
destination_station_id FK stations  (sonraki istasyon)
status            enum     (in_transit, at_station, processing, done)
created_at        timestamptz
```

### lot_parts

Lot'a hangi parçalar ait.

```
lot_id            FK lots
part_id           FK parts
```

### pallets

Fiziksel taşıyıcı — ~1m istif.

```
id                UUID
code              string   "PAL-2026-0424-005"
current_station_id FK stations  (nullable — ara stokta olabilir)
current_location  string   (ara stok alanı adı)
status            enum     (at_station, in_buffer, in_transit, empty)
created_at        timestamptz
```

### pallet_parts

Palet içindeki parçalar (çoka-çok).

```
pallet_id         FK pallets
part_id           FK parts
lot_id            FK lots   (optional — hangi lot'un parçası)
```

### operators

```
id                UUID
code              string
name              string
active            boolean
```

### sessions

Operatör X istasyonda lot/part'ı ne zaman başlattı/bitirdi.

```
id                UUID
operator_id       FK operators
station_id        FK stations
machine_id        FK machines  (nullable — manuel istasyonlarda boş)
lot_id            FK lots      (nullable)
started_at        timestamptz
ended_at          timestamptz  (nullable — devam ediyor)
notes             text
```

### production_records

Üretilen miktar, fire, kalite notu.

```
id                UUID
session_id        FK sessions
part_id           FK parts
quantity_produced int
quantity_scrapped int
quality_note      text
recorded_at       timestamptz
```

---

## Barcode Hierarchy (Kritik Farklılaşma)

Self-referencing tree — rakip MES'lerde çözülmemiş problem.

```
barcodes tablosu:
  id                UUID
  code              text   (barkod metni)
  type              enum   (part | pallet | lot | sub_module | module | group | project | shipment)
  parent_id         FK barcodes  (self-reference, nullable)
  source_ref        UUID   (hangi entity'ye bağlı — part_id, pallet_id, module_id, vs.)
  metadata          jsonb  (tip bazlı ek bilgi)
  created_at        timestamptz
```

### Hiyerarşi Örneği

```
Part barkodu          "1135"  (IMOS'tan geldi — kesim sonrası fiziksel)
  ↓ palete konur
Pallet barkodu        "PAL-001"  (FactoryOS üretti)
  ↓ lot'un parçası
Lot barkodu           "LOT-001"  (FactoryOS üretti)
  ↓ toplamada çözülür
Sub-module barkodu    (parçalar birleşti — YENİ seviye)
  ↓ modül oluştu
Module barkodu        "D3-001"  (FactoryOS üretti)
  ↓ proje
Project barkodu       "MUT-001"
  ↓ sevkiyat
Shipment barkodu      "SHIP-2026-0425-001"
```

Bir barkod tarandığında:
- Kendi bilgisi
- Üstündeki hiyerarşi (recursive CTE ile parent'lar)
- Altındaki alt öğeler (recursive CTE ile children'lar)

---

## Karar Noktaları ve Cevapları

| Karar | Kim verir | Ne zaman |
|---|---|---|
| Ürün yapısı (project/module/sub_module/part) | IMOS/Cabinet Vision | Tasarım aşaması |
| Rota (parça hangi operasyonlardan geçer) | CAD/CAM — ProductionRoute | Parça tanımında |
| Barkodlar (parça bazlı) | CAD/CAM (IMOS IntelliDivide) | Tasarım aşaması |
| WO birleştirme (hangi siparişler aynı batch'te) | Supervisor | Üretim planlama |
| Lot oluşumu | Kesim makinesi (doğal, aynı nitelikteki parçalar) | Kesim çıkışı |
| Palet birleştirme | Operatör (fiziksel gerçeklik) | Runtime |
| Hat ataması (hangi montaj hattına) | Supervisor (MVP sonrası) | Üretim planlama |
| Makine override (routing flex) | Supervisor (MVP sonrası) | Üretim planlama |
| Özel sipariş (MVP sonrası) | Supervisor | İhtiyaç çıktığında |

---

## Montaj = "Supplier" Mantığı

Önemli kavram: Montaj hattı ana üretim noktasıdır, önceki istasyonlar tedarikçidir.

- Montaj bir sub_module'u (veya modülü) başlatmak için tüm parçaları bekler
- Parça eksikse (hatalı kesim, henüz kesilmemiş, hardware gelmedi) **montaj beklemez ve başlamaz**
- Sistem "sub_module için hazır mı?" kontrolü yapar
- Eksik durum UI'da görünür (supervisor ve montaj operatörü)

MVP'den itibaren bu prensibi doğru kuruyoruz — yoksa sahada "yanlış parça ile montaj başladı" sorunları çıkar.

---

## Windows-Linux Köprü Stratejisi

CAD/CAM programları (IMOS, Cabinet Vision, Homag CADmatic) sadece Windows'ta çalışır. FactoryOS Ubuntu Linux'ta. Veri alışverişi için 3 seçenek:

### Seçenek A: Manual Upload (MVP varsayılanı)

Tasarımcı IMOS'tan export alır → FactoryOS web UI'ında "Import Project" butonuna tıklar → dosyayı yükler → sistem parse eder.

- **En basit**, IT entegrasyonu yok
- Demo'da güçlü hikaye ("bak, anında görünüyor")
- Müşteri fabrikasında hemen test edilebilir

### Seçenek B: Watched Folder (ilk müşteri kurulumu)

Windows PC'de paylaşımlı klasör (SMB) → FactoryOS bu klasörü mount eder → file watcher worker sürekli izler → yeni dosya gelince otomatik import.

- Yarı otomatik, 10 saniye gecikme
- IT ekibiyle SMB kurulumu gerekir

### Seçenek C: Windows Agent (enterprise)

Windows'a küçük Node.js agent yazılır → export klasörünü izler → HTTP POST ile FactoryOS'a gönderir.

- En profesyonel, error handling temiz
- Windows'a yazılım kurmak gerekir

**MVP:** Seçenek A. B ve C advanced roadmap'te.

Detaylar `docs/adapters-reference.md` içinde.

---

## ERP Entegrasyonu — Ağ Topolojisi

FactoryOS ↔ ERP arasında 3 senaryo:

### Senaryo 1: Yerel ağ (aynı fabrika)

Webhook + REST API ikisi de direkt çalışır.

### Senaryo 2: ERP başka lokasyonda (merkez ofis, başka fabrika)

- Webhook için: VPN, Cloudflare Tunnel, Tailscale, veya polling mode
- REST API: FactoryOS internet erişimi varsa direkt çalışır

### Senaryo 3: ERP bulutta (ERPNext Cloud, vs.)

- Webhook için: public endpoint veya polling mode
- REST API: problem yok

**MVP:** Senaryo 1 (yerel ağ, webhook + REST). Senaryo 2-3 advanced.

Integration service mode-aware tasarlanır: `ERP_INTEGRATION_MODE=webhook|poll|both`

Detaylar `docs/adapters-reference.md` içinde.

---

## Advanced Model (MVP Sonrası Roadmap)

Şu an eklenmiyor, ama model bunlara hazır:

### 1. Routing Flexibility (v2)
- `operations[].alternative_machine_ids` dolacak
- `machines.capabilities` dolacak
- Supervisor override UI: "Bu operasyon CNC yerine edge bander'da yapılsın"
- Capability-matching algoritması

### 2. Purchased Custom Parts (v2)
- Özel sipariş kapak (membran, alüminyum, cam)
- Ölçü + modül bağlantısı
- Tedarikçi sipariş süreci (mini satınalma veya ERP)
- Durum takibi: requested → ordered → delivered → in_stock
- Montaj bekleme logic'i

### 3. External Manufacturing (v2)
- `part_type=external` aktifleşir
- İlk istasyon kesim olmak zorunda değil
- Dış kesim → doğrudan bantlama veya CNC'den başlayabilir

### 4. Multi-Line Assembly (v3)
- Ana, küçük parça, özel ürün hatları
- Supervisor hat ataması
- Modül tipine göre öneri

### 5. Semi-Assembly + Site Installation (v3)
- Büyük dolaplar sökülü paketlenir
- Paketlemede saha montaj talimatı
- Paketleme ekranı büyük ekran olabilir

### 6. Machine Integration (v4)
- Homag Connect (MQTT veya OPC UA)
- Biesse, SCM adapter'ları
- Machine telemetry → UNS → TimescaleDB
- OEE, cycle time, alarm tracking

### 7. AI Öneri Motoru (v5)
- "Bu WO'ları birleştirirsen X dk kazanırsın"
- Kapasite planlama
- Darboğaz tespiti
- Fire/kalite anomali tespiti

---

## MVP Scope (Dondurulmuş)

### Kapsam İÇİ
- Hiyerarşi: projects → modules → sub_modules → parts
- `part_type`: manufactured, purchased_stock (hardware)
- Materials, edge_bands top-level entity
- Rota: cutting → banding → cnc → assembly → packaging (tek hat)
- Machines entity (envanter + preferred_machine, routing flex altyapı)
- Lot + palet takibi
- Barkod hiyerarşisi (part → pallet → lot → sub_module → module → group → project)
- Operatör ekranı (tablet): istasyon seç + açık iş listesi + başlat/bitir + miktar/fire + barkod tarama
- Yönetici dashboard: aktif WO'lar, günlük özet, kim ne yapıyor
- Supervisor ekranı: WO birleştirme, basit planlama
- Part Contract v2 + IMOS adapter (ilk version)
- Manual upload import (Windows-Linux köprü)

### Kapsam DIŞI (Advanced'e bırakıldı)
- Routing flexibility (alternative_machines, capabilities kullanımı)
- purchased_custom + tedarikçi takibi
- external manufacturing
- Multi-line assembly
- Semi-assembly / saha montajı akışı
- Watched folder / Windows agent
- ERP polling mode (webhook yeterli MVP'de)
- Makine entegrasyonu (Homag Connect vs.)
- OEE / kalite / SPC
- AI öneri motoru
- Multi-tenancy active implementation

---

## Açık Sorular

1. **WO birleştirme / Production Plan objesi nasıl modellenir?**  
   MVP'de basit mi tutalım (WO tek kayıt, `project_ids[]` dizisi), yoksa ayrı `production_plans` entity mi?

2. **Barkod formatı**  
   IMOS kendi formatını üretiyor ("1135"). Pallet/module/project barkodları FactoryOS üretecek. Format standardı (GS1, Code128, QR) ve namespace (`FOS-PAL-001`) kararı.

3. **Multi-tenancy (SaaS hazırlığı)**  
   Baştan `tenant_id` kolonu her tabloda mı? MVP tek tenant ('default'), sonradan tenant ekle?

4. **MES-Integration service ilişkisi: aynı DB mi, ayrı mı?**  
   - Aynı DB: Basit başlangıç, concept separation zayıflar
   - Ayrı DB + UNS üzerinden haberleşme: Temiz ayrım, daha karmaşık
   - Karar: ADR yazılacak (probably aynı DB başlangıçta, sonra ayır)

5. **Hangi CAD/CAM ile başlıyoruz?**  
   Şu an: IMOS (gerçek export örneği var) + Cabinet Vision (planlanıyor). Her ikisi de Windows.

---

## Versiyon Geçmişi

- **v1 (2026-04-23):** İlk dondurma. Tasarım sprint'i 1-3 oturum özeti.
- **v2 (2026-04-24):** IMOS gerçeği ile kalibre edildi. Sub_module eklendi. Machines entity ayrı oldu. Routing flex altyapı hazır. Materials/edge_bands top-level. Multi-barcode. Cutting/final dimensions. Windows-Linux köprü + ERP topology kavramı eklendi.