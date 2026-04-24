# FactoryOS — Domain Model v1 (MVP)

> **Durum:** MVP için donduruldu. Genişletmeler "Advanced" bölümünde roadmap olarak duruyor.
> **Tarih:** 2026-04-23
> **Sonraki adım:** Part Contract (JSON schema) — IMOS örnek export'u ile birlikte tasarlanacak.

---

## Felsefe ve Prensipler

Tasarım sprinti boyunca çıkan temel ilkeler:

1. **Parça-merkezli model.** İş emri (WO) tek bir durum makinesi değil — parçaların durumlarından türeyen bir agregasyondur. Her parça kendi yolunda ilerler.

2. **Üretim akışı parça/lot/palet bazlıdır, WO bazlı değil.** Kesim, bantlama, CNC istasyonlarında farklı WO'ların parçaları karışık akabilir. Toplama istasyonu parçaları kendi WO'larına göre ayırır (sorter rolü).

3. **Montaj öncesi = "supplier" rolü.** Otomotiv prensibi: montaj hattı ana üretim noktasıdır. Öncesindeki istasyonlar (kesim, bantlama, CNC) montajın tedarikçisi gibi çalışır. Montaj, parça eksikse başlamamalı.

4. **Concept separation.** MES, ERP'yi veya CAD yazılımını bilmez. Sadece UNS ve standart Part Contract üzerinden konuşur. Yeni bir kaynak sistem gelince (Logo, Netsis, Cabinet Vision vs.) yeni adapter yazılır, MES kodu değişmez.

5. **Sistem akıllı olsun, ama dayatmasın.** Supervisor karar verir, sistem öneri sunar. "Bu WO'ları birleştirsen şu kadar zaman kazanırsın" gibi öneriler ileride mümkün, ama karar insana ait.

6. **"Operatör düşünmesin" prensibi.** Sistem önüne ne yapacağını, hangi parçayı, hangi palette, hangi sırayla koyar. Operatör sadece uygular. Hataya yer vermez.

7. **Ürün odak:** Modüler mobilya (mutfak, banyo, gardırop, mağaza dekorasyonu). Otomotiv tarzı tam otomasyon değil — manuel istasyonlar + makine karışık akış.

---

## Satış Pozisyonu (Domain'e Etkisi)

FactoryOS'un farklılaşma noktaları:

- **ERP ve CAD/CAM agnostik** — her müşterinin farklı stack'ini sindiren platform
- **Modüler mobilyaya özgü iş akışı** — generic MES'in bilmediği hiyerarşik barkod (parça → modül → grup → proje)
- **Operatör UX** — "düşünmesinler" prensibi, Türkiye pazarı için uygun
- **Hiyerarşik barkod zinciri** — sektörde çözülmemiş problem

MES ve MQTT detayları **teknik altyapı**, satış hikayesinin kahramanı değil. Müşteriye "diğerlerinin yapamadığını biz yapıyoruz" anlatılıyor.

---

## Fabrika Süreci — Gerçek Akış

### İki fazlı süreç (otomotiv analojisi)

```
FAZ 1: PART PREPARATION (parça hazırlık)
  • Kesim (Homag panel ebatlama veya benzeri)
  • Bantlama (kenar bantlama)
  • CNC (delik, kanal, freze)
  • Dış kaynaklı operasyonlar (dış kesim, özel kapak imalatı vs.)

  ↓ Toplama/Sorter noktası
  (parçalar WO'larına göre ayrılır, modül bazlı gruplanır)

FAZ 2: ASSEMBLY + FINISHING
  • Ana montaj hattı (büyük dolaplar)
  • Küçük parça hattı (çekmece, baza, özel aksesuar)
  • Özel ürün hattı (alüminyum kapaklı, cam kapaklı vs.)
  
  ↓
  • Temizleme
  • Paketleme (saha montaj talimatıyla birlikte)

  ↓ Sevkiyat
  
  • SAHA MONTAJI (teslim yerinde tamamlanır — yarı montaj modeli)
```

### İstasyon ↔ Hat kavramı

- "İstasyon" tek bir iş bölümü (kesim makinesi, bantlama makinesi)
- "Hat" bir fiziksel akış — birden fazla istasyon birlikte
- Fabrikanın montaj bölümünde **birden fazla paralel hat** olabilir
- Parçanın hangi hatta gideceği **supervisor kararı** (IMOS hat yapısını bilmez)
- Sistem öneri verebilir (modül tipine göre), supervisor override eder

---

## Domain Entities — MVP Kapsamı

### Product Structure (Ürün Yapısı — IMOS/CAD'den gelir)

```
projects          Ahmet'in mutfağı (MUT-001)
    ↓ 1:N
groups            Alt tezgah grubu, üst dolap grubu
    ↓ 1:N
modules           Alt dolap D3 (600mm)
    ↓ 1:N
parts             Yan panel, arka, raf, çekmece rayı, menteşe
```

**Önemli:** Bu hiyerarşi statik, tasarım aşamasında belirlenir. IMOS veya benzeri CAD/CAM'den gelir.

### Part (temel entity)

```
parts
  id                    FOS-MUT-001-P012
  module_id             D3 dolabının parçası
  description           "Sol yan panel"
  
  part_type:
    - manufactured         içeride üretilir (kesim/bantlama/CNC)
    - purchased_stock      standart satınalma (menteşe, vida, ray)
    - purchased_custom     özel sipariş (membran kapak, cam kapak) — MVP'de YOK
    - external             dışarıda ürettirildi (dış kesim) — MVP'de YOK
  
  material              MDF 18mm Beyaz
  dimensions            length, width, thickness
  quantity              modülde bu parçadan kaç tane
  
  operations[]          sıralı rota (kesim → bantlama → CNC → montaj → paketleme)
  
  barcode               parça barkodu (kesim sonrası üretilir)
  current_station
  current_status        pending | in_progress | done_at_station | completed | scrapped | rework
```

### Route / Operations

Her parçanın kendi rotası var. Rota bilgisi **IMOS'tan gelir** (çünkü parça bazlı farklı olabilir):

```
part: MUT-001-P012 (yan panel)
operations: [
  { phase: 1, station: "cutting",    status: "done",    source: "internal" },
  { phase: 1, station: "banding",    status: "pending" },   // 4 side banding
  { phase: 1, station: "cnc",        status: "pending" },   // delik programı var
  { phase: 2, station: "assembly",   status: "pending" },
  { phase: 3, station: "packaging",  status: "pending" }
]
```

**Rota esnekliği:**
- Bazı parçalar bantlanmaz (üst panel vs.)
- Bazı parçalar CNC'ye uğramaz (delik yoksa)
- Bazı parçalar kesilmeden gelir (`source: "external"`)
- Rota IMOS'ta tanımlı, MES uygular

### Lots (Batch)

**Lot = batch size.** Aynı operasyonda birlikte işlem görecek parçalar.

- **Homogeneous lot:** 80 adet MDF 18mm 720x560 panel (hepsi aynı)
- **Mixed lot / batch size 1:** Her parça farklı ölçüde, ama aynı makineden geçecekler

```
lots
  id                    LOT-2026-0423-001
  type                  homogeneous | mixed
  source_operation      hangi istasyondan çıktı (örn. cutting)
  destination           bir sonraki istasyon (örn. banding)
  parts[]               hangi parçalar (ayrı WO'lardan olabilir)
  status                in_transit | at_station | processing | done
```

Lot **paketleme'ye kadar yaşar**, sonra anlamı kaybolur (parçalar modüle dönüşür).

### Pallets (Palet)

**Palet = fiziksel taşıyıcı.** ~1m yükseklik limiti, parçalar bir arada taşınır.

```
pallets
  id                    PAL-2026-0423-005
  current_location      istasyon veya ara stok alanı
  parts[]               içindeki parçalar (lot bilgisi üzerinden de çıkar)
  status                at_station | in_buffer | in_transit
```

**Palet ↔ Lot ilişkisi çoka-çok:**
- Bir palet bir lot içerebilir (çok sayıda aynı parça)
- Bir palet birden fazla lot içerebilir (azar azar birleştirilmiş)
- Bir lot birden fazla palete yayılabilir (istif limitini aşarsa)

### Work Orders

```
work_orders
  id                    WO-2026-0423-001
  projects[]            ilişkili proje(ler) — bir WO birden fazla proje içerebilir
  status                OPEN | CLOSED  (agregate durum, parçalardan türetilir)
  supervisor_id         kim planladı
  created_at
  planned_start_date
```

**Supervisor WO birleştirme kararı burada:** "MUT-001, MUT-002 ve MUT-003'ün kesim işlerini birlikte yap" kararı bir WO üst kaydı olarak veya bir "production plan" objesi olarak modellenecek. MVP'de basit tutalım, detayını sonra konuşalım.

### Stations, Operators, Sessions

```
stations              kesim, bantlama, CNC, ana_montaj, küçük_parça_hattı, paketleme
operators             personel
sessions              operator X, station Y'de, lot Z'yi işlemeye başladı — bitirdi
production_records    kaç parça üretildi, kaç fire, hangi session'da
```

### Barcodes (Hiyerarşik Tree)

**Kritik farklılaşma noktası.** Self-referencing tree:

```
barcodes
  id                    UUID
  code                  barkod metni (standard üzerinden özelleştirilebilir format)
  type                  part | pallet | lot | module | group | project | shipment
  parent_id             kendine referans (nullable)
  source_ref            hangi entity'ye bağlı
  metadata              JSONB (tip bazlı ek bilgi)
  created_at
```

**Hiyerarşi örneği:**
```
Part barkodu          (kesimden çıktı, 1 panel)
  ↓ palete konur
Pallet barkodu        (1 palet, N parça)
  ↓ lot'un parçası
Lot barkodu           (üretim akışı için)
  ↓ toplama'da çözülür
Module barkodu        (D3 dolap — parçalar birleşti)
  ↓ montaj hattı
Group barkodu         (alt tezgah grubu — modüller birleşti)
  ↓
Project barkodu       (MUT-001 Ahmet'in mutfağı)
  ↓ sevkiyat
Shipment barkodu      (Ahmet'in adresine giden kargo)
```

Bir barkod tarandığında:
- Kendi bilgisi
- Üstündeki hiyerarşi (parent → parent → ...)
- Altındaki alt öğeler (recursive CTE)

Çoğu rakip MES'te çözülmemiş problem. **FactoryOS'un temel satış kozu.**

---

## Kritik Karar Noktaları ve Cevapları

| Karar | Kim verir | Ne zaman |
|---|---|---|
| Ürün yapısı (proje/grup/modül/parça) | IMOS veya CAD/CAM | Tasarım aşaması |
| Rota (parça hangi operasyonlardan geçer) | IMOS/parça bilgisi | Parça tanımında |
| WO birleştirme (hangi siparişler aynı batch'te) | Supervisor | Üretim planlama |
| Hat ataması (hangi montaj hattına) | Supervisor | Üretim planlama |
| Dış sipariş (özel kapak vs.) | Supervisor | İhtiyaç çıktığında |
| Lot oluşturma | Kesim makinesi (doğal, aynı nitelikteki parçalar) | Kesim çıkışı |
| Palet birleştirme | Operatör (fiziksel gerçeklik) | Runtime |

---

## Faz 2'de Operasyonların "Supplier" Mantığı

Önemli kavram: **Montaj hattı ana üretim noktasıdır.** Öncesindeki istasyonlar montajın supplier'ıdır.

- Montaj bir modülü başlatmak için tüm parçaları bekler
- Parça eksikse (hatalı kesim, henüz kesilmemiş, dış kaynaklı parça gelmedi vs.) montaj **beklemez ve başlamaz**
- Sistem "modül için hazır mı?" kontrolü yapar
- Parçaların hangi palette/lot'ta olduğunu izler
- Eksik durum UI'da görünür (supervisor ve montaj operatörü görsün)

Bu prensibi MVP'den itibaren doğru kurmak kritik — yoksa saha'da "yanlış parça ile montaj başladı, sökmek lazım" sorunu çıkar.

---

## Advanced Model (MVP Sonrası Roadmap)

Şu an **eklenmiyor**, ama model yapısı bunları taşıyabilecek şekilde tasarlanıyor:

### 1. Purchased Custom Parts
Membran kapak, alüminyum cam kapak gibi özel sipariş parçalar.
- Ölçü + modül bağlantısı var
- Tedarikçiye sipariş süreci (mini satınalma modülü veya ERP'ye bağlantı)
- Durum takibi: requested → ordered → delivered → in_stock
- Montaj bekleme logic'i

### 2. External Manufacturing
Fabrikanın kesim işini dışarıya vermesi.
- Part'ın `source: "external"` olabilir
- İlk istasyon kesim olmak zorunda değil
- Dışarıdan gelen parça doğrudan bantlamadan veya CNC'den başlayabilir

### 3. Multi-Line Assembly
- Ana modül hattı (büyük dolaplar)
- Küçük parça hattı (çekmece, baza)
- Özel ürün hattı (cam kapak, alüminyum vs.)
- Supervisor karar verir hangi modül hangi hatta
- Sistem modül tipine göre öneri verebilir

### 4. Semi-Assembly + Site Installation
- Büyük dolaplar tam birleştirilmez, sevkiyat için parçalara ayrılır
- Paketlemede saha montaj talimatı basılır
- Paketleme hatası = sahada eksik parça (kritik)
- Paketleme ekranı "büyük ekran" olabilir (operatörün hızla kontrol etmesi için)

### 5. Makine Entegrasyonu
- Homag Connect (MQTT veya OPC UA üzerinden)
- Biesse, SCM ve diğerleri için adapter'lar
- Machine telemetry → UNS → PG (TimescaleDB hypertable)
- OEE, cycle time, alarm tracking

### 6. AI Öneri Motoru
- "Bu WO'ları birleştirirsen X dk kazanırsın"
- Kapasite planlama
- Darboğaz tespiti
- Fire/kalite anomali tespiti

---

## Part Contract (Bir Sonraki Adım)

FactoryOS'un **tüm dış sistemlerle konuştuğu standart JSON format.**

Adapter mimarisi:
```
IMOS XML export      ─┐
ERPNext BOM          ─┤
Cabinet Vision       ─┼→ Adapter → FactoryOS Part Contract (JSON) → UNS → MES
Optimizasyon prog.   ─┤
CSV upload (manual)  ─┘
```

**MES hiçbir kaynak formatını bilmez.** Sadece Part Contract'ı konuşur.

### Taslak (detay Part Contract dokümanında)

```json
{
  "contract_version": "1.0",
  "source_system": "imos",
  "imported_at": "2026-04-23T10:30:00Z",
  
  "project": {
    "code": "MUT-001",
    "name": "Ahmet'in Mutfağı",
    "customer": "...",
    "delivery_address": "..."
  },
  
  "groups": [
    {
      "code": "MUT-001-G02",
      "name": "Çalışma Tezgahı",
      "modules": [
        {
          "code": "MUT-001-M05",
          "name": "Alt Dolap D3",
          "module_type": "standard",
          "parts": [
            {
              "code": "MUT-001-P012",
              "description": "Sol yan panel",
              "part_type": "manufactured",
              "material": "MDF 18mm Beyaz",
              "dimensions": { "length": 720, "width": 560, "thickness": 18 },
              "quantity": 1,
              "operations": [
                { "phase": 1, "station": "cutting" },
                { "phase": 1, "station": "banding", "details": { "sides": 4 } },
                { "phase": 1, "station": "cnc", "program_file": "MUT-001-P012.mpr" },
                { "phase": 2, "station": "assembly" },
                { "phase": 3, "station": "packaging" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Yarın yapılacak:**
- IMOS'tan bir gerçek export örneği al
- Part Contract'ı bu örneği dönüştürebilecek şekilde tasarla
- JSON Schema formal dokümanı yaz
- Adapter prototipi ne zaman yazılacak karar ver

---

## Açık Sorular / Sonra Karar Verilecek

1. **WO birleştirme / Production Plan objesi nasıl modellenir?**  
   MVP'de basit mi tutalım (WO direkt plan), yoksa ayrı `production_plans` entity mi?

2. **Barkod formatı standart mı özel mi?**  
   GS1/Code128 üzerinden özelleştirilebilir format — detay sonra.

3. **Multi-tenancy (SaaS hazırlığı)**  
   Baştan `tenant_id` kolonu her tabloda mı? MVP'de tek tenant olarak çalış, sonradan tenant ekle?

4. **MES-Integration service ilişkisi: aynı DB mi, ayrı mı?**  
   - Aynı DB: Basit başlangıç, concept separation zayıflar
   - Ayrı DB + UNS üzerinden haberleşme: Temiz ayrım, daha karmaşık
   - Karar: ADR yazılacak

5. **MVP için hangi ERP ile başlanacak?**  
   ERPNext open-source, şimdilik onun üzerinden gitmek mantıklı ama müşteri farklı isteyebilir.

---

## MVP Scope (Dondurulmuş)

### Kapsam İÇİ
- Projeler / gruplar / modüller / parçalar hiyerarşisi
- `part_type`: manufactured, purchased_stock
- Rota: kesim → bantlama → CNC → montaj → paketleme (tek hat başta)
- Lot + palet takibi
- Barkod hiyerarşisi (part → pallet → module → group → project)
- Operatör ekranı (tablet): istasyon seç + açık iş listesi + başlat/bitir + miktar/fire
- Yönetici dashboard: aktif WO'lar, günlük özet, kim ne yapıyor
- Part Contract + IMOS adapter (ilk version)
- Supervisor ekranı: WO birleştirme, hat ataması

### Kapsam DIŞI (Advanced'e bırakıldı)
- purchased_custom + tedarikçi takibi
- external manufacturing (dış kesim)
- Multi-line assembly
- Semi-assembly / saha montajı akışı
- Makine entegrasyonu (Homag Connect vs.)
- OEE / kalite / SPC
- AI öneri motoru
- Multi-tenancy active implementation (hazırlık var, kullanım yok)

---


**Bu dokümanda eklenecek şeyler:**
- Açık soruların cevapları geldikçe güncellenir
- Yeni domain kararları buraya not düşülür
- MVP implementation başladığında "v1 vs gerçek" farkları işaretlenir

**Versiyon geçmişi:**
- v1 (2026-04-23): İlk dondurma. Tasarım sprint'i 1-3 oturum özeti.