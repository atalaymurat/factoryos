# FactoryOS — Adapters Reference

> **Amaç:** Dış sistemleri (CAD/CAM yazılımları, ERP sistemleri) FactoryOS'a bağlamak için referans doküman. Her sistem için mapping tablosu + entegrasyon topolojisi.
>
> **Prensip:** FactoryOS (MES core) hiçbir dış sistemi bilmez. Adapter'lar çevirmendir — dış sistemin formatını `Part Contract v2`'ye veya UNS event'ine dönüştürür.
>
> **Durum:** MVP için hazır.
> **Tarih:** 2026-04-24
> **İlgili:** `domain-model-v2.md`, `part-contract-v2.md`

---

## İçerik

1. [Adapter Mimari Prensibi](#adapter-mimari-prensibi)
2. [CAD/CAM Adapter'ları](#cadcam-adapterları)
   - [IMOS Adapter](#imos-adapter)
   - [Cabinet Vision Adapter (planlanan)](#cabinet-vision-adapter-planlanan)
3. [Windows-Linux Bridge Stratejileri](#windows-linux-bridge-stratejileri)
4. [ERP Entegrasyonu](#erp-entegrasyonu)
5. [Yeni Adapter Nasıl Yazılır](#yeni-adapter-nasıl-yazılır)

---

## Adapter Mimari Prensibi

### Concept Separation

```
┌─────────────────────────────────────┐
│  FactoryOS MES Core (Linux)         │
│  - Domain model                     │
│  - Part Contract v2 consumer        │
│  - UNS publisher/subscriber          │
│  - Knows NO external system          │
└─────────────────────────────────────┘
          ↑
          │ Part Contract v2 (standard JSON)
          │ UNS events (MQTT)
          │
┌─────────┴───────────────────────────┐
│  Adapter Layer                      │
│  - IMOS adapter                     │
│  - Cabinet Vision adapter           │
│  - ERPNext adapter                  │
│  - Logo/Mikro/Netsis adapter        │
│  - Manual CSV upload                │
└─────────────────────────────────────┘
          ↑
          │ Vendor-specific format
          │
┌─────────┴───────────────────────────┐
│  External Systems                   │
│  - IMOS (Windows)                   │
│  - Cabinet Vision (Windows)         │
│  - ERPNext (Linux/Windows/Cloud)    │
│  - Logo (Windows)                   │
└─────────────────────────────────────┘
```

**Her adapter iki fonksiyon sağlar:**

1. **Inbound:** Dış sistem → FactoryOS (iş emri, parça listesi, vb.)
2. **Outbound:** FactoryOS → Dış sistem (üretim sonucu, stok güncellemesi, vb.)

MVP'de inbound öncelikli. Outbound (ERPNext'e geri yazma) Faz 2.

### Adapter Türleri

| Tür | Tetiklenme | Örnek |
|---|---|---|
| **File-based** | Dosya değişikliği / manuel upload | IMOS export, CSV |
| **Webhook receiver** | Dış sistem HTTP POST atar | ERPNext webhook |
| **API poller** | Periyodik çeker | ERP REST API'den WO listesi |
| **Database reader** | Direkt DB'ye bağlanır | Eski sistemler için (nadiren) |
| **MQTT bridge** | UNS'te başka topic'e yayınlar | Homag Connect, OPC UA |

---

## CAD/CAM Adapter'ları

### IMOS Adapter

**Kaynak:** IMOS iX Furnish, IMOS iX CAD/CAM (Windows yazılımı)
**Export formatı:** JSON (native), XML (legacy)
**Tetiklenme:** File-based
**Durum:** Analiz tamamlandı, prototip bekliyor

#### IMOS Export Yapısı

IMOS export'u 5 seviyeli iç içe yapı:

```
Order (#Typ=0)                     → Sipariş container
  └─ Article (#Typ=1)              → Modül
      └─ Assembly (#Typ=2)         → Sub-module (alt montaj grubu)
          └─ Part (#Typ=3)         → Üretim parçası
              └─ Part (#Typ=8)     → Hardware (vida, menteşe)
              ├─ Material (#Typ=4) → Malzeme kaydı
              ├─ Edge (#Typ=7)     → Kenar bandı kaydı
              ├─ Program (#Typ=9)  → CNC/makine program referansı
              └─ Element (#Typ=10) → CNC geometri detayı (groove, drill)
```

**Gerçek örnek:** `_cMES_Order.JSON` — 1.5 MB, 22 modül, 158 sub-module, 184 üretim parçası, 799 hardware, 806 makine programı.

#### IMOS → Part Contract v2 Mapping

##### Order Level

| IMOS Field | Contract Field | Notes |
|---|---|---|
| `order.ArticleNumber` | `work_order.code` | |
| `order.OrderCreationDate` | `work_order.notes` (metadata) | Format: `12.08.2025` |
| `order.OrderModificationDate` | `work_order.metadata.modified_at` | |
| `order.AddressFirstName + LastName` | `work_order.customer_name` | Concatenated |
| `order.AddressStreet + PostCode + Town + Country` | `work_order.customer_address` | Concatenated |
| `order.DeliveryDate` | `work_order.planned_end_date` | |
| `order.OrderDescriptionLong` | `work_order.notes` | |

##### Project Level

| IMOS Field | Contract Field | Notes |
|---|---|---|
| `order.#OrderId` | `project.code` | Örn: "_cMES_Order" |
| `order.ArticleNumber` | `project.name` | Fallback |
| `order.Collection` | `project.type` | Eğer "kitchen"/"bathroom" içeriyorsa |

##### Material (Type 4)

Global deduplicate. Aynı `ArticleNumber` tekrar görüldüğünde eklenmez.

| IMOS Field | Contract Field |
|---|---|
| `material.ArticleNumber` | `materials[].code` |
| `material.ArticleDescription` | `materials[].description` |
| `material.ArticleDescription2` | `materials[].description_long` |
| `material.MaterialCategory` | `materials[].category` |
| `material.Thickness` | `materials[].thickness_mm` |
| `material.MaterialGrain` | `materials[].grain` (convert to bool) |
| `material.Supplier` | `materials[].supplier.name` |
| `material.PurchaseOrderNumber` | `materials[].supplier.purchase_order_number` |
| `material.Price` | `materials[].supplier.price_per_sheet` |

##### Edge Band (Type 7) — Global

Global deduplicate (aynı `ArticleNumber` bir kez kaydedilir).

| IMOS Field | Contract Field |
|---|---|
| `edge.ArticleNumber` | `edge_bands[].code` |
| `edge.ArticleDescription` | `edge_bands[].description` |
| `edge.EdgeMaterial` | `edge_bands[].material` |
| `edge.EdgeColor` | `edge_bands[].color` |
| `edge.Thickness` | `edge_bands[].thickness_mm` |
| `edge.EdgeGeometry` | `edge_bands[].geometry` |
| `edge.Supplier` | `edge_bands[].supplier.name` |
| `edge.PurchaseOrderNumber` | `edge_bands[].supplier.purchase_order_number` |

##### Module (Article — Type 1)

| IMOS Field | Contract Field |
|---|---|
| `article.ID` | `modules[].metadata.source_id` |
| `article.ArticleNumber` | `modules[].article_number` |
| `article.ArticleDescription` | `modules[].name` |
| `article.ConstructionPrinciple` | `modules[].construction_principle` (+ metadata) |
| `article.Length` | `modules[].dimensions.length_mm` |
| `article.Width` | `modules[].dimensions.width_mm` |
| `article.Thickness` | `modules[].dimensions.depth_mm` |
| `article.Weight` | `modules[].weight_kg` |
| `article.ArticleInfo1 == "Assembled"` | `modules[].is_assembled_at_factory` |

**Module code generation:** IMOS `ID` benzersiz, ama bizim için `{project.code}-M{sequence}` daha okunur. Adapter her iki formatı da taşır.

##### Sub-Module (Assembly — Type 2)

| IMOS Field | Contract Field |
|---|---|
| `assembly.ID` | `sub_modules[].metadata.source_id` |
| `assembly.ArticleNumber` | `sub_modules[].name` |
| `assembly.#ParentId` | → bağlı modülün source_id'sine eşleştir |

**Sub-module code:** `{module.code}-S{sequence}`

##### Part — Manufactured (Type 3)

| IMOS Field | Contract Field |
|---|---|
| `part.ID` | `parts[].metadata.source_id` |
| `part.#ParentId` | → sub_module'ün source_id'sine eşleştir |
| `part.ArticleNumber` | `parts[].article_number` |
| `part.ArticleDescription` | `parts[].description` |
| — | `parts[].part_type = "manufactured"` |
| `part.Barcode` | `parts[].barcodes.primary` |
| `part.NcBarcode1, NcBarcode2, NcBarcode3` | `parts[].barcodes.operation_barcodes[]` (empty string'ler filter) |
| `part.CuttingLength/Width/Thickness` | `parts[].dimensions.cutting` |
| `part.Length/Width/Thickness` | `parts[].dimensions.final` |
| `part.GrainOrientation` | `parts[].grain_orientation_degrees` |
| `part.DesiredTargetQuantity` | `parts[].quantity` |
| `part.CutFlag` | `parts[].flags.cut` (1→true, 0→false) |
| `part.CncFlag` | `parts[].flags.cnc` |
| `part.BomFlag` | `parts[].flags.include_in_bom` |
| `part.PartDefinition` | `parts[].metadata.part_definition` |
| `part.Checksum` | `parts[].metadata.checksum` |
| `part.EdgeTransition` | `parts[].metadata.edge_transition_code` |

Material referansı: `part.subelements[].material.ArticleNumber` → `parts[].material_code`

##### Part — Hardware (Type 8)

| IMOS Field | Contract Field |
|---|---|
| `part.ID` | `parts[].metadata.source_id` |
| `part.#ParentId` | → sub_module bağlantısı |
| `part.ArticleNumber` | `parts[].article_number` |
| `part.ArticleDescription` | `parts[].description` |
| — | `parts[].part_type = "purchased_stock"` |
| `part.DesiredTargetQuantity` | `parts[].quantity` |
| `part.Supplier` | `parts[].supplier.name` |
| `part.PurchaseOrderNumber` | `parts[].supplier.purchase_order_ref` |
| `part.Price` | `parts[].supplier.price_per_unit` |
| `part.PartType` (=15) | `parts[].metadata.part_type_code` |

##### Part Edges

Her part'ın içindeki `edge` subelements'ı → `parts[].edges[]`

| IMOS Field | Contract Field |
|---|---|
| `edge.ArticleNumber` | `parts[].edges[].edge_band_code` (edge_bands[] referansı) |
| `edge.EdgeSequence` | `parts[].edges[].sequence` |
| `edge.EdgeTrim` | `parts[].edges[].side` (L→long_edge, S→short_edge) |
| `edge.MachiningSides` | `parts[].edges[].machining_sides` |

##### Operations (ProductionRoute Parse)

IMOS format: `"1_10202_ETQ810&1_&1_10106_BHN510&1_10201_ETQ810&2_10203_ETQS500&2_10305_DTQV310&"`

**Parse algoritması:**

```
input: "1_10202_ETQ810&1_&1_10106_BHN510&..."
split by "&"
  → ["1_10202_ETQ810", "1_", "1_10106_BHN510", ...]

her token için split by "_":
  len == 3: [phase_or_seq, machineId, machineModel]   → valid operation
  len == 2: [seq, ""]                                  → empty slot, skip
  empty: end marker, skip
```

**Phase mapping (IMOS'ta tuple'ın ilk kısmı "1" veya "2"):**
- `"1_..."` → phase 1 (preparation)
- `"2_..."` → phase 2 (assembly/finishing)

Bizim 3 phase modelimizde bu tam örtüşmüyor. Dönüşüm:
- Phase 1 + station cutting/banding/cnc → `phase: 1` (preparation)
- Phase 2 + station (anything) → station'a göre belirle (`phase: 2` assembly veya `phase: 3` packaging)

**Station kategori mapping (machine model prefix'e göre):**

| Machine Model Prefix | Contract Station | machine_type |
|---|---|---|
| `BHN*` (BHN510) | `cutting` | `panel_saw` |
| `ETQ*, DTQ*` (ETQ810, DTQV310, DTQD510, ETQS500) | `banding` | `edge_bander` |
| `BHH*` (BHH400) | `cnc` | `cnc_drill` |
| `BHX*` (BHX560) | `cnc` | `cnc_router` |
| `MLK*` (MLK110) | `cnc` | `cnc_router` |
| `JP_DH*` | `cnc` | `cnc_router` |
| (bilinmeyen) | `cnc` (default) | `generic` |

**Output:**

```json
"operations": [
  {
    "sequence": 1,
    "phase": 1,
    "station": "banding",
    "preferred_machine_code": "10202_ETQ810",
    "alternative_machine_codes": [],
    "required_capabilities": [],
    "required": true,
    "details": {}
  },
  {
    "sequence": 2,
    "phase": 1,
    "station": "cutting",
    "preferred_machine_code": "10106_BHN510",
    ...
  },
  ...
]
```

**Assembly ve packaging ekleme:** IMOS ProductionRoute sadece preparation içerir. Adapter otomatik ekler:

```json
{
  "sequence": N+1,
  "phase": 2,
  "station": "assembly",
  "required": true,
  "details": {}
},
{
  "sequence": N+2,
  "phase": 3,
  "station": "packaging",
  "required": true,
  "details": {}
}
```

##### Programs (Type 9)

Part'ın `subelements[].program` listesi → ilgili operation'ın `details.programs[]`.

| IMOS Field | Contract Field |
|---|---|
| `program.MachineID` | — match against `preferred_machine_code` |
| `program.MachineNcNumber` | `programs[].program_id` |
| `program.CncName` | `programs[].program_id` (fallback) |
| `program.CncPath + CncExtension` | `programs[].file_path` |
| — | `programs[].file_name = "{MachineNcNumber}.{CncExtension}"` |
| `program.CncExtension` | `programs[].file_format = "homag_{ext}"` (örn. homag_mpr) |
| `program.Workflow` | `programs[].workflow` |
| `program.MachineBarcode` | `programs[].barcode` |

**Program → operation eşleşmesi:** `program.MachineID` değeri `operations[].preferred_machine_code` ile eşleşmeli. Eşleşmezse program metadata'ya düşer (warning log).

##### Machining Features (Type 10 — Element)

Opsiyonel. MVP'de kullanılmaz, saklanır.

| IMOS Field | Contract Field |
|---|---|
| `element.TYPE` | `machining_features[].feature_type` ("groove", "drill_hole", ...) |
| `element.MACHINING` | `machining_features[].machining` ("cut") |
| `element.PosX/Y/Z` | `machining_features[].position` |
| `element.OutPosX/Y/Z` | `machining_features[].end_position` |
| `element.Width` | `machining_features[].dimensions.width_mm` |
| `element.Thickness` | `machining_features[].dimensions.depth_mm` |
| `element.MachineName` | `machining_features[].machine_code` |

##### Machines

IMOS'tan gelen unique `MachineID`'ler contract'ın `machines[]` top-level listesine deduplicate edilir.

```json
{
  "code": "10303_BHX560",
  "model": "BHX560",    // parse from code
  "machine_type": "cnc_router",  // from prefix rules
  "station_code": null   // IMOS bilmiyor, MES tarafında doldurulur
}
```

#### Adapter İş Akışı

```
1. IMOS export dosyası al (JSON)
2. UTF-8 BOM varsa temizle
3. JSON parse et
4. Validation: Version, required fields, top-level structure
5. Extract:
   a. work_order (from order)
   b. project (from order)
   c. materials[] (deduplicate, #Typ=4)
   d. edge_bands[] (deduplicate, #Typ=7)
   e. machines[] (deduplicate from all MachineID references)
   f. modules[] (#Typ=1)
   g. sub_modules[] (#Typ=2)
   h. parts[] manufactured (#Typ=3)
   i. parts[] hardware (#Typ=8)
6. Resolve parent relationships (#ParentId chains)
7. Parse ProductionRoute strings → operations[]
8. Attach programs to operations (by machine match)
9. Extract machining_features (#Typ=10) to parts
10. Build Part Contract v2 JSON
11. POST to FactoryOS /api/v1/import/contract
```

#### Örnek Çıktı Boyutu

1.5 MB IMOS export → ~800 KB contract JSON
- Boş alanlar temizlendi (IMOS'un 40+ boş ArticleInfo alanı)
- Structured operations (kodlu string yerine array)
- Deduplicate materials/edges (5 material 169 kayıttan)

---

### Cabinet Vision Adapter (planlanan)

**Kaynak:** Cabinet Vision (Planit) — Windows yazılımı, Kuzey Amerika'da yaygın
**Export formatı:** XML (primary), CSV (legacy)
**Durum:** ⏳ Örnek export beklenliyor

#### Beklenen Yapı

Cabinet Vision IMOS'a benzer hiyerarşi sunar:
- Job → Cabinets → Parts → Materials/Edges

Tam mapping Cabinet Vision export örneği geldiğinde yazılacak.

#### Mapping Şablonu (hazırlık)

```
Cabinet Vision Job        → work_order + project
Cabinet Vision Cabinet    → module
Cabinet Vision Part       → part (manufactured)
Cabinet Vision Hardware   → part (purchased_stock)
Cabinet Vision Material   → materials[]
Cabinet Vision Edge       → edge_bands[]
```

Sub-module seviyesi Cabinet Vision'da olmayabilir — bu durumda adapter her module'ün altında tek varsayılan sub-module üretir ("Main Assembly" gibi).

---

## Windows-Linux Bridge Stratejileri

CAD/CAM programları (IMOS, Cabinet Vision, Homag CADmatic) sadece Windows'ta çalışır. FactoryOS Ubuntu Linux'ta. Dosya ve veri alışverişi için üç seçenek:

### Seçenek A: Manual Upload (MVP varsayılanı)

**Nasıl çalışır:**

```
IMOS → "Export" → C:\exports\order.json
                         ↓
                   (tasarımcı browser'da)
                         ↓
FactoryOS Web UI → "Import Project" button → file upload
                         ↓
                   Part Contract adapter
                         ↓
                   MES database
```

**Teknik detay:**
- FactoryOS'ta `/app/import` sayfası (Next.js)
- File input → multipart upload → `/api/v1/import/contract` endpoint
- IMOS adapter server-side çalışır, dosyayı parse eder
- Sonuç: "22 modül, 184 parça başarıyla import edildi"

**Avantajları:**
- Sıfır IT entegrasyonu
- Hemen demo edilebilir
- Debug kolay (dosyayı indir, incele)
- Müşteriye "biz çalışıyoruz" gösterimi hızlı

**Dezavantajları:**
- Tasarımcı her projede manuel iş yapar
- Dosya kaybolma/versiyonlama riski

**Ne zaman uygun:**
- MVP ve demo
- İlk müşteri kurulumu (pilot)
- Küçük fabrika (haftada 5-10 proje)

---

### Seçenek B: Watched Folder (ilk müşteri kurulumu)

**Nasıl çalışır:**

```
Windows PC:
  IMOS → "Export" → \\factory-pc\imos-exports\     (Samba paylaşımı)
                             ↓ (her dakika polling)
Ubuntu Server:
  /mnt/imos-exports (SMB mounted read-only)
         ↓
  File Watcher worker (chokidar / fs.watch)
         ↓
  Adapter → Part Contract → MES DB
         ↓
  Dosya → \\factory-pc\imos-exports\processed\   (taşı)
```

**Teknik detay:**

Ubuntu server'da SMB mount:
```bash
# /etc/fstab
//factory-pc/imos-exports /mnt/imos-exports cifs \
  username=factory,password=...,uid=1000,gid=1000,ro 0 0
```

FactoryOS'ta yeni worker (`file-watcher.worker.js`):
- `chokidar` ile klasörü izle
- Yeni `.json` dosyası → stabil olana kadar bekle (yazım bitsin)
- Adapter'ı çağır, import et
- `processed/` alt klasörüne taşı (ya da silmek yerine `archive/`)

**Avantajları:**
- Yarı otomatik, tasarımcı manuel iş yapmıyor
- ~30 saniye gecikme (kabul edilebilir)
- Tasarımcı tarafında mevcut iş akışı değişmiyor

**Dezavantajları:**
- IT ekibiyle Samba/SMB kurulumu (tek seferlik)
- Network güvenliği düşünülmeli (share credentials, read-only)
- Windows UNC path permissions hassas

**Ne zaman uygun:**
- İlk gerçek müşteri (pilot sonrası)
- Tasarımcı + üretim birlikte çalışan fabrika
- Orta ölçek (günde 5-20 proje)

---

### Seçenek C: Windows Agent (enterprise)

**Nasıl çalışır:**

```
Windows PC:
  IMOS → "Export" → C:\exports\order.json
                          ↓
  FactoryOS Agent (Windows Service, Node.js)
    - Monitors C:\exports
    - Reads new files
    - POSTs to FactoryOS HTTP endpoint
                          ↓ HTTP/HTTPS
Ubuntu Server:
  FactoryOS /api/v1/import/contract
                          ↓
  Adapter → MES DB
```

**Teknik detay:**

Windows PC'ye Node.js runtime + FactoryOS Agent kurulur:
```
C:\Program Files\FactoryOS-Agent\
  agent.exe         (node-packaged binary)
  config.json
  logs\
```

Agent config:
```json
{
  "watch_folder": "C:\\exports\\imos",
  "factoryos_url": "https://factoryos.customer.local:33002",
  "api_key": "...",
  "poll_interval_sec": 5
}
```

Windows service olarak kurulur (`nssm` veya `node-windows`).

**Avantajları:**
- En profesyonel deneyim
- Error handling, retry, log yönetimi agent'ta
- HTTPS ile güvenli transfer
- Çoklu watch folder desteği
- Offline durumunda queue'da tutar

**Dezavantajları:**
- Windows'a yazılım kurmak gerekir (IT onayı)
- Bakım maliyeti (agent güncellemeleri)
- Package/deployment pipeline gerekli

**Ne zaman uygun:**
- Büyük müşteri / kurumsal
- Çok lokasyonlu fabrika (her lokasyon agent)
- SaaS model (FactoryOS bulutta, agent her müşteri fabrikasında)

---

### Seçenek Karşılaştırma Tablosu

| Kriter | A: Manual | B: Watched | C: Agent |
|---|---|---|---|
| Kurulum süresi | 0 dk | 1-2 saat | 1 gün |
| IT bilgisi gerekli | Hayır | Orta (SMB) | Yüksek (Windows service) |
| Otomasyon seviyesi | Yok | Yarı otomatik | Tam otomatik |
| Tasarımcı iş yükü | Her projede manuel | Sıfır | Sıfır |
| Gecikme | Anında (manuel) | 30 sn | 5-30 sn |
| Error handling | UI'da gösterilir | Log + email | Agent log + retry |
| Güvenlik | HTTPS + auth | SMB auth | HTTPS + API key |
| Bakım maliyeti | Yok | Düşük | Orta |
| **MVP için?** | ✅ | ❌ | ❌ |
| **İlk müşteri?** | Pilot | ✅ | ❌ |
| **Enterprise?** | ❌ | Orta | ✅ |

---

## ERP Entegrasyonu

FactoryOS ↔ ERP iki yönlü veri akışı:

1. **Inbound:** ERP → FactoryOS (yeni iş emri)
2. **Outbound:** FactoryOS → ERP (üretim sonucu, stok değişimi)

### Ağ Topolojisi Senaryoları

#### Senaryo 1: Yerel Ağ (aynı fabrika)

```
Fabrika LAN:
  ├─ FactoryOS (10.0.0.10:33002)
  ├─ ERP Server (10.0.0.50:8000)
  └─ Operatör tabletleri
```

**Inbound:** ERP → webhook → FactoryOS (direkt HTTP POST)

```
ERPNext Webhook config:
  URL: http://10.0.0.10:33002/webhook
  Event: After Insert (Work Order)
  Secret: <HMAC key>
```

**Outbound:** FactoryOS → ERP REST API

```javascript
// FactoryOS'ta üretim bittiğinde:
POST http://10.0.0.50:8000/api/resource/Stock Entry
Authorization: token api_key:api_secret
Body: { stock_entry_type, items: [...] }
```

**Durum:** MVP varsayılanı. Entegrasyon basit.

---

#### Senaryo 2: ERP Başka Lokasyonda (merkez ofis)

```
Fabrika (Ankara):
  ├─ FactoryOS
  └─ [Internet gateway]
          ↓
         Internet
          ↓
Merkez ofis (İstanbul):
  └─ ERP Server
```

**Sorun:** ERP fabrikanın iç IP'sine direkt erişemez.

**Çözümler:**

**2a. VPN (Site-to-site)**
- Fabrika ↔ Merkez ofis arası IPSec veya WireGuard tüneli
- IT ekibi kurar
- Webhook Senaryo 1 gibi çalışır

**2b. Public Endpoint (Cloudflare Tunnel)**
- FactoryOS Cloudflare Tunnel ile public URL kazanır
- Tunnel istemcisi FactoryOS sunucusunda çalışır, outbound bağlantı açar
- ERP webhook'u public URL'e atar

```
ERPNext Webhook:
  URL: https://factoryos-ankara.yourdomain.com/webhook
  → Cloudflare → Tunnel → FactoryOS (fabrika içi)
```

**Avantajı:** Public IP/firewall/port-forwarding sorunu yok
**Dezavantajı:** Cloudflare (veya alternatif) hizmetine bağımlılık

**2c. Tailscale / ZeroTier**
- Peer-to-peer VPN
- FactoryOS ve ERP sunucusu aynı Tailscale ağında
- Hiç public endpoint açmadan direkt konuşurlar
- Free tier yeterli (20 cihaza kadar)

**2d. Polling Mode**
- Webhook yerine FactoryOS periyodik ERP'ye sorar: "Yeni WO var mı?"
- Sadece FactoryOS'un internet erişimi gerekli
- Gerçek zamanlı değil (1-5 dk gecikme)
- Entegrasyon servisinde `ERP_INTEGRATION_MODE=poll` ile aktif

**Outbound her senaryoda aynı:** FactoryOS → Internet → ERP REST API (FactoryOS giden bağlantı kurabiliyor).

---

#### Senaryo 3: ERP Bulutta

```
Fabrika:
  └─ FactoryOS → Internet → ERPNext Cloud (https://customer.frappe.cloud)
```

**Inbound:**
- **3a:** Public endpoint (Cloudflare Tunnel) — ERP webhook'u FactoryOS public URL'e atar
- **3b:** Polling — FactoryOS ERPNext'in API'sini periyodik sorgular

**Outbound:** Her zaman çalışır — FactoryOS → Internet → ERPNext API.

---

### Integration Service Mode Architecture

FactoryOS integration service üç modu destekleyecek şekilde tasarlanır:

```
Integration Service modes:

  Mode: webhook
    - /webhook endpoint dinler
    - ERP HTTP POST atar
    - Senaryo 1, 2a, 2b, 2c, 3a için

  Mode: poll
    - Cron worker: her 60 sn ERP'ye sorar
    - Değişen WO'ları çeker
    - Senaryo 2d, 3b için

  Mode: both
    - İkisini birden çalıştırır
    - Webhook primary, poll fallback
```

Config:
```bash
ERP_INTEGRATION_MODE=webhook|poll|both
ERP_BASE_URL=https://customer.frappe.cloud
ERP_API_KEY=...
ERP_API_SECRET=...
ERP_POLL_INTERVAL_SECONDS=60
ERP_WEBHOOK_SECRET=...   # HMAC verification
```

**MVP'de sadece webhook mode.** Poll mode v2'de.

---

### Güvenlik

**Her senaryoda şunlar zorunlu:**

1. **HMAC signature** — Webhook'larda X-Frappe-Webhook-Signature (zaten implement edildi)
2. **HTTPS** — Public endpoint'lerde Let's Encrypt
3. **API key rotation** — ERP API anahtarı 90 günde bir değişir
4. **IP allow-list** — Mümkünse ERP IP'si whitelist (Cloudflare Tunnel'da otomatik)
5. **Rate limiting** — Webhook endpoint spam'a karşı korunur

---

## Yeni Adapter Nasıl Yazılır

Müşteri X'in ERP'si Logo. FactoryOS'a nasıl entegre edilir?

### 1. Araştırma

- Logo'nun export formatı ne? (XML, JSON, custom?)
- Hangi feature desteklenir? (Work Order, BOM, Item master)
- Teknik doküman var mı?
- Trigger ne? (User export butonu, cron, webhook?)

### 2. Mapping Tablosu Yaz

Bu dokümana yeni bölüm ekle:

```
## Logo Adapter

### Mapping

| Logo Field | Contract Field | Notes |
|---|---|---|
| STOCKREF.CODE | parts[].code | |
| ...
```

### 3. Adapter Iskeleti (Node.js)

```
apps/adapters/logo-adapter/
  src/
    config/
    services/
      logo-reader.js        # Logo export parse
      contract-builder.js   # FactoryOS Part Contract v2 üret
      factoryos-client.js   # /api/v1/import/contract'a POST
    index.js
```

### 4. Test Fixture

- Logo'dan gerçek bir örnek export al
- `fixtures/logo-sample-001.xml` olarak kaydet
- Unit test: `logo-adapter → Part Contract v2` dönüşümü

### 5. Validation

- Part Contract v2 JSON Schema'ya karşı validate
- FactoryOS dev ortamında import testi
- Hata durumları: missing fields, duplicate codes, reference integrity

### 6. Documentation

- Bu dokümana Logo bölümü ekle
- README'de "supported ERPs" listesine ekle
- Troubleshooting notları

### 7. Deployment

- Adapter kendi container'ında çalışır
- `docker-compose.yml`'a service olarak ekle
- Env konfigürasyonu (source URL, auth)

---

## Open Questions

1. **IMOS adapter ayrı servis mi, integration-service içinde mi?**
   - Ayrı servis: temiz, ayrı deploy/scale edilebilir, ama complexity +1
   - Integration içinde: basit, MVP için uygun
   - **MVP: integration-service içinde bir modül.** v2'de ayrılır.

2. **Program dosyaları (.mpr, .saw) ile ne yapacağız?**
   - MVP'de sadece referans tutulur (path + name)
   - Makineye transfer CAM yazılımının işi
   - v3'te FactoryOS dosya transferini yönetebilir (SMB mount, FTP, Homag API)

3. **Multi-source scenarios**
   - Bir projede hem IMOS (parça listesi) hem Logo (iş emri + müşteri bilgisi) gelirse?
   - İki adapter birlikte çalışır, MES'te merge edilir
   - Merge strategy: IMOS master for parts, Logo master for WO meta

4. **Adapter versiyonlama**
   - IMOS v14 vs IMOS v15 export'u farklı olabilir
   - Adapter içinde version detection + farklı parser
   - Contract output aynı

5. **Cabinet Vision örnek export ne zaman gelecek?**
   - Alındığında bu dokümana eklenecek
   - IMOS ile büyük fark beklenmeyen

---

## Next Steps

1. ✅ IMOS mapping dokümantasyonu (bu doküman)
2. ⏳ JSON Schema dosyası (validator için formal)
3. ⏳ IMOS adapter prototipi (Node.js kod)
4. ⏳ Test fixture: `_cMES_Order.JSON` → beklenen contract JSON
5. ⏳ MES tarafında `/api/v1/import/contract` endpoint
6. ⏳ Manual upload UI (Next.js sayfa)

---

## Versiyon Geçmişi

- **v1 (2026-04-24):** İlk doküman. IMOS mapping tam, Cabinet Vision placeholder. Windows-Linux 3 strateji. ERP network topology 3 senaryo.