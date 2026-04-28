# FactoryOS Part Contract v2

> **Amaç:** Tüm dış sistemlerin (IMOS, Cabinet Vision, ERPNext BOM, manuel CSV, özel adapter) MES'e ürün yapısı + iş emri + operasyonel detayları gönderirken uyacağı standart JSON format.
>
> **Prensip:** MES hiçbir kaynak formatını bilmez. Sadece bu contract'ı konuşur. Yeni kaynak = yeni adapter, MES kodu değişmez.
>
> **Durum:** MVP için donduruldu.
> **Tarih:** 2026-04-24
> **Önceki versiyon:** v1.1 (`docs/archive/part-contract-v1.1.md`)
> **İlgili:** `domain-model-v2.md`, `adapters-reference.md`

---

## v1.1 → v2 Değişiklikleri

- ✅ **`sub_modules[]` top-level liste eklendi** — IMOS Assembly seviyesi
- ✅ **`materials[]` ve `edge_bands[]` top-level liste eklendi** — deduplicate, tedarikçi bilgileri ile
- ✅ **`parts[]` tek liste oldu** — `part_type` ile manufactured/hardware ayrımı
- ✅ **Cutting vs Final dimensions** — ikisi ayrı
- ✅ **Multi-barcode** — primary + operation_barcodes
- ✅ **Operations yeniden yapılandırıldı** — preferred_machine, alternative_machines, capabilities (altyapı)
- ✅ **`machining_features[]` eklendi** — opsiyonel CNC geometri detayı
- ✅ **Flags (cut, cnc, include_in_bom)** eklendi — IMOS CutFlag/CncFlag/BomFlag karşılığı
- ✅ **Module-level operations kaldırıldı** — sub_module hiyerarşisi bu ihtiyacı doğal olarak çözüyor

---

## Yapı Kararları

1. **Granülarite: Orta seviye.** Proje üst bilgi + entity listeleri düz. Hiyerarşi ID referanslarıyla kurulur.
2. **Kapsam: Ürün yapısı + iş emri birlikte.** Atomic import.
3. **Normalize edilmiş entity'ler.** Materials, edge_bands top-level — parts bunlara ID ile referans verir.
4. **MES catalog authority.** Machines and stations are MES-owned configuration; they are NOT carried in this contract. Operations reference them by code (e.g. `preferred_machine_code`) and the import validates each code exists in `mes.machines` / `mes.stations`. See `adapters-reference.md` § "MES Catalog Authority".
5. **Versiyonlu.** `contract_version` zorunlu.
6. **IMOS-compatible ama vendor-agnostic.** IMOS gerçeği referans alındı, ama Cabinet Vision/diğerleri de aynı yapıya uyar.

---

## Top-Level Yapı

```json
{
  "contract_version": "2.0",
  "source": "imos",
  "source_ref": "_cMES_Order.JSON",
  "imported_at": "2026-04-24T09:00:00Z",

  "work_order": { ... },
  "project": { ... },

  "materials": [ ... ],       // deduplicate, global
  "edge_bands": [ ... ],      // deduplicate, global

  "modules": [ ... ],
  "sub_modules": [ ... ],
  "parts": [ ... ]            // manufactured + hardware karışık, part_type ile ayrılır
}
```

---

## Tam Örnek (JSON)

```json
{
  "contract_version": "2.0",
  "source": "imos",
  "source_ref": "_cMES_Order.JSON",
  "imported_at": "2026-04-24T09:00:00Z",

  "work_order": {
    "code": "WO-2026-0424-001",
    "customer_name": "Ahmet Yılmaz",
    "customer_address": "İstanbul, Kadıköy, ...",
    "priority": "normal",
    "planned_start_date": "2026-04-25",
    "planned_end_date": "2026-05-02",
    "notes": "Teslim tarihi kritik"
  },

  "project": {
    "code": "MUT-001",
    "name": "Ahmet Yılmaz Mutfağı",
    "type": "kitchen",
    "metadata": {
      "designer": "Zeynep K.",
      "design_version": "v3",
      "source_order_id": "_cMES_Order"
    }
  },

  "materials": [
    {
      "code": "MEL_White_19",
      "description": "Melamine, PB, White, G2S, 3/4",
      "description_long": "PB19_Melamin_White",
      "category": "Particle board",
      "thickness_mm": 19,
      "grain": false,
      "supplier": {
        "name": "Uniboard",
        "purchase_order_number": "S-FAM-00007-A",
        "price_per_sheet": 10.61
      }
    }
  ],

  "edge_bands": [
    {
      "code": "ABS_Oak_1p2",
      "description": "ABS Oak 1.2",
      "material": "ABS",
      "color": "Oak",
      "thickness_mm": 1.2,
      "geometry": "PG_RTB0p5",
      "supplier": {
        "name": "iFurn",
        "purchase_order_number": "EG08U999ST2_23"
      }
    },
    {
      "code": "ABS_White_0p8",
      "description": "ABS White 0.8",
      "material": "ABS",
      "color": "White",
      "thickness_mm": 0.8,
      "geometry": "PG_RTB0p5"
    }
  ],

  "modules": [
    {
      "code": "MUT-001-M01",
      "article_number": "W_BC_2D_R",
      "name": "Alt Dolap D3",
      "module_type": "base_cabinet_door",
      "construction_principle": "W_BC_2D_R",
      "dimensions": {
        "length_mm": 915,
        "width_mm": 915,
        "depth_mm": 391.5
      },
      "weight_kg": 41.383,
      "is_assembled_at_factory": true,
      "images": [
        { "type": "module_3d", "url": "https://cdn.customer.com/modules/D3-3d.png" },
        { "type": "assembly_guide", "url": "https://cdn.customer.com/modules/D3-assembly.pdf" }
      ],
      "metadata": {
        "source_id": "16494"
      }
    }
  ],

  "sub_modules": [
    {
      "code": "MUT-001-M01-S01",
      "module_code": "MUT-001-M01",
      "name": "Gable Right",
      "sequence": 1,
      "metadata": {
        "source_id": "16520_0"
      }
    },
    {
      "code": "MUT-001-M01-S02",
      "module_code": "MUT-001-M01",
      "name": "Gable Left",
      "sequence": 2
    }
  ],

  "parts": [
    {
      "code": "P1135",
      "module_code": "MUT-001-M01",
      "sub_module_code": "MUT-001-M01-S01",

      "article_number": "Gable Right",
      "description": "Sağ yan panel",
      "part_type": "manufactured",

      "barcodes": {
        "primary": "1135",
        "operation_barcodes": ["1135_01", "1135_02"]
      },

      "dimensions": {
        "cutting": { "length_mm": 915.2, "width_mm": 334.3, "thickness_mm": 19 },
        "final":   { "length_mm": 915.0, "width_mm": 334.5, "thickness_mm": 19 }
      },

      "material_code": "MEL_White_19",
      "grain_orientation_degrees": 0,
      "quantity": 1,

      "edges": [
        { "sequence": 1, "edge_band_code": "ABS_Oak_1p2", "side": "long_edge" },
        { "sequence": 2, "edge_band_code": "ABS_White_0p8", "side": "short_edge" },
        { "sequence": 3, "edge_band_code": "ABS_White_0p8", "side": "long_edge" },
        { "sequence": 4, "edge_band_code": "ABS_White_0p8", "side": "short_edge" }
      ],

      "flags": {
        "cut": true,
        "cnc": true,
        "include_in_bom": true
      },

      "operations": [
        {
          "sequence": 1,
          "phase": 1,
          "station": "cutting",
          "preferred_machine_code": "10106_BHN510",
          "alternative_machine_codes": [],
          "required_capabilities": [],
          "required": true,
          "details": {}
        },
        {
          "sequence": 2,
          "phase": 1,
          "station": "banding",
          "preferred_machine_code": "10202_ETQ810",
          "alternative_machine_codes": [],
          "required_capabilities": [],
          "required": true,
          "details": {}
        },
        {
          "sequence": 3,
          "phase": 1,
          "station": "cnc",
          "preferred_machine_code": "10303_BHX560",
          "alternative_machine_codes": [],
          "required_capabilities": [],
          "required": true,
          "details": {
            "programs": [
              {
                "program_id": "1135",
                "file_name": "1135.mpr",
                "file_path": "D:\\NCDATA\\Stelumar\\CAM_Output\\BHX_560\\_cMES_Order\\S_BS1_Edge2_BHX34_BHH_MLK_JP\\1135",
                "file_format": "homag_mpr",
                "workflow": "S_BS1_Edge2_BHX34_BHH_MLK_JP",
                "barcode": "1135_01"
              }
            ]
          }
        },
        {
          "sequence": 4,
          "phase": 2,
          "station": "assembly",
          "required": true,
          "details": {}
        },
        {
          "sequence": 5,
          "phase": 3,
          "station": "packaging",
          "required": true,
          "details": {}
        }
      ],

      "machining_features": [
        {
          "feature_type": "groove",
          "machining": "cut",
          "position": { "x": 0, "y": 308.65, "z": 19 },
          "end_position": { "x": 915, "y": 308.65, "z": 19 },
          "dimensions": { "width_mm": 13.7, "depth_mm": 9.5 },
          "machine_code": "10203_ETQS500"
        }
      ],

      "metadata": {
        "source_id": "16520",
        "source_parent_id": "16520_0",
        "part_definition": "PD_W_1_RG_F001",
        "checksum": "6677hhd3zb",
        "edge_transition_code": "010::000:"
      }
    },

    {
      "code": "HW-HE-MP-H0-001",
      "module_code": "MUT-001-M01",
      "sub_module_code": "MUT-001-M01-S01",

      "article_number": "HE_MP_H0_9071625",
      "description": "Hinge plate, nickel, adjustable, Euro screw",
      "part_type": "purchased_stock",

      "quantity": 2,

      "supplier": {
        "name": "Richelieu",
        "part_code": "9071625",
        "purchase_order_ref": "HW-CON-00001-A",
        "price_per_unit": 0.10
      },

      "flags": {
        "include_in_bom": true
      },

      "operations": [
        {
          "sequence": 1,
          "phase": 2,
          "station": "assembly",
          "required": true,
          "details": {}
        }
      ],

      "metadata": {
        "source_id": "33401",
        "part_type_code": 15
      }
    }
  ]
}
```

---

## Alan Açıklamaları

### Üst Seviye

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `contract_version` | string | ✓ | "2.0" |
| `source` | string | ✓ | "imos", "cabinet_vision", "erpnext_bom", "manual_csv", "custom" |
| `source_ref` | string | ✗ | Kaynak dosya adı / export ID |
| `imported_at` | ISO datetime | ✓ | Adapter bu JSON'u ne zaman üretti |
| `work_order` | object | ✓ | İş emri meta |
| `project` | object | ✓ | Proje meta |
| `materials` | array | ✓ | Kullanılan malzemeler (deduplicate) |
| `edge_bands` | array | ✓ | Kullanılan kenar bantları (deduplicate) |
| `machines` | array | ✗ | Kaynak sistem biliyorsa — MES envantere ekler |
| `modules` | array | ✓ | Modüller |
| `sub_modules` | array | ✓ | Alt montaj grupları |
| `parts` | array | ✓ | Parçalar (manufactured + hardware) |

### work_order

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique WO kodu |
| `customer_name` | string | ✓ | Müşteri adı |
| `customer_address` | string | ✗ | Sevkiyat adresi |
| `priority` | enum | ✗ | "low", "normal", "high", "urgent" |
| `planned_start_date` | date | ✗ | Planlanan başlangıç |
| `planned_end_date` | date | ✗ | Planlanan bitiş |
| `notes` | string | ✗ | Supervisor notları |

### project

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique proje kodu |
| `name` | string | ✓ | Okunabilir isim |
| `type` | enum | ✓ | "kitchen", "bathroom", "wardrobe", "shop", "other" |
| `metadata` | object | ✗ | Kaynak-özel ek bilgi |

### materials[]

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique malzeme kodu (IMOS "MEL_White_19") |
| `description` | string | ✓ | Okunabilir tanım |
| `description_long` | string | ✗ | Alternatif açıklama |
| `category` | string | ✗ | "Particle board", "MDF", "Solid wood", "Glass", ... |
| `thickness_mm` | number | ✗ | Levha kalınlığı |
| `grain` | boolean | ✗ | Damar yönü var mı |
| `supplier` | object | ✗ | `{ name, purchase_order_number, price_per_sheet }` |

### edge_bands[]

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique bant kodu |
| `description` | string | ✓ | Okunabilir tanım |
| `material` | string | ✗ | "ABS", "PVC", "Melamin", ... |
| `color` | string | ✗ | Renk adı |
| `thickness_mm` | number | ✗ | Bant kalınlığı |
| `geometry` | string | ✗ | Kesim geometrisi kodu (IMOS'tan) |
| `supplier` | object | ✗ | `{ name, purchase_order_number, price }` |

### modules[]

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique modül kodu (proje içinde) |
| `article_number` | string | ✗ | CAD sisteminin adlandırması |
| `name` | string | ✓ | Okunabilir isim |
| `module_type` | string | ✗ | "base_cabinet_door", "wall_cabinet", "drawer_unit", ... (enum değil, esnek) |
| `construction_principle` | string | ✗ | IMOS ConstructionPrinciple — metadata |
| `dimensions` | object | ✗ | `{ length_mm, width_mm, depth_mm }` |
| `weight_kg` | number | ✗ | Toplam ağırlık |
| `is_assembled_at_factory` | boolean | ✗ | Fabrikada monte mi, sahada mı (IMOS ArticleInfo1) |
| `images` | array | ✗ | `[{ type, url }]` |
| `metadata` | object | ✗ | - |

### sub_modules[]

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique sub_module kodu |
| `module_code` | string | ✓ | Bağlı olduğu modül |
| `name` | string | ✓ | "Gable Right", "Door Left", "Bottom Shelf" |
| `sequence` | int | ✗ | Modül içindeki sırası |
| `metadata` | object | ✗ | - |

### parts[] — manufactured

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique parça kodu |
| `module_code` | string | ✓ | Bağlı modül |
| `sub_module_code` | string | ✗ | Bağlı sub_module (nullable) |
| `article_number` | string | ✗ | CAD adlandırması |
| `description` | string | ✓ | Okunabilir |
| `part_type` | enum | ✓ | "manufactured" |
| `barcodes` | object | ✗ | `{ primary, operation_barcodes: [] }` |
| `dimensions` | object | ✓ | `{ cutting: {L,W,T}, final: {L,W,T} }` |
| `material_code` | string | ✓ | materials[] referansı |
| `grain_orientation_degrees` | number | ✗ | 0, 90, 180, 270 |
| `quantity` | int | ✓ | Modülde/sub_module'de adet |
| `edges` | array | ✗ | `[{ sequence, edge_band_code, side }]` |
| `flags` | object | ✗ | `{ cut, cnc, include_in_bom }` |
| `operations` | array | ✓ | Rota |
| `machining_features` | array | ✗ | CNC geometri detayları (opsiyonel, MVP'de kullanılmaz) |
| `metadata` | object | ✗ | - |

### parts[] — purchased_stock (hardware)

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `code` | string | ✓ | Unique kod |
| `module_code` | string | ✓ | Bağlı modül |
| `sub_module_code` | string | ✗ | Bağlı sub_module |
| `article_number` | string | ✗ | CAD/tedarikçi adlandırması |
| `description` | string | ✓ | - |
| `part_type` | enum | ✓ | "purchased_stock" |
| `quantity` | int | ✓ | Adet |
| `supplier` | object | ✓ | `{ name, part_code, purchase_order_ref, price_per_unit }` |
| `flags` | object | ✗ | `{ include_in_bom }` |
| `operations` | array | ✓ | Genelde sadece assembly |
| `metadata` | object | ✗ | - |

**NOT:** `dimensions`, `material_code`, `edges`, `machining_features` hardware için zorunlu değil/geçersiz.

### parts[].edges[] (manufactured için)

Her kenar için ayrı kayıt.

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `sequence` | int | ✓ | IMOS EdgeSequence (1, 2, 3, 4) |
| `edge_band_code` | string | ✓ | edge_bands[] referansı |
| `side` | enum | ✗ | "long_edge" / "short_edge" (IMOS EdgeTrim L/S) |
| `machining_sides` | int | ✗ | Ek işleme bilgisi |

### parts[].operations[]

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `sequence` | int | ✓ | 1, 2, 3, ... |
| `phase` | int | ✓ | 1=preparation, 2=assembly, 3=packaging |
| `station` | enum | ✓ | "cutting", "banding", "cnc", "assembly", "packaging" |
| `preferred_machine_code` | string | ✗ | CAD/CAM önerisi (MVP bu'nu default kullanır) |
| `alternative_machine_codes` | array | ✗ | Routing flex (MVP'de boş) |
| `required_capabilities` | array | ✗ | Capability matching (MVP'de boş) |
| `required` | boolean | ✓ | false = atlanabilir |
| `details` | object | ✗ | Station-özel (programs, kit, shipping_info, ...) |

### parts[].operations[].details — Station-Özel

#### cutting

```json
{
  "details": {
    "optimization_ref": "intellidivide-2026-0424-05"
  }
}
```

Program dosyaları genelde `cnc` operasyonuna bağlı, kesim operasyonu makineye optimizasyon sonrası gider.

#### banding

```json
{
  "details": {
    "edge_material_code": "ABS_Oak_1p2",
    "sides": ["front", "back", "top", "bottom"]
  }
}
```

İstasyon seviyesinde ek detay — parça seviyesinde `edges[]` zaten var.

#### cnc

```json
{
  "details": {
    "programs": [
      {
        "program_id": "1135",
        "file_name": "1135.mpr",
        "file_path": "D:\\NCDATA\\...\\1135",
        "file_format": "homag_mpr",
        "workflow": "S_BS1_Edge2_BHX34_BHH_MLK_JP",
        "barcode": "1135_01"
      }
    ]
  }
}
```

Bir CNC operasyonunda birden fazla program olabilir (makine farklı side'ları işlemek için).

#### assembly (sub_module bazlı)

MVP'de sub_module'ün tüm parçaları otomatik kit olur. `details` boş.

İleride:
```json
{
  "details": {
    "assembly_guide_url": "https://cdn.customer.com/modules/D3-assembly.pdf",
    "estimated_duration_sec": 600
  }
}
```

#### packaging

MVP'de basit. İleride:
```json
{
  "details": {
    "label_template": "shipping_label_v1",
    "shipping_info": {
      "customer_address": "...",
      "room_reference": "Mutfak - Çalışma tezgahı",
      "package_sequence": "3/12"
    },
    "site_assembly_kit": [
      { "part_code": "SITE-001", "quantity": 1 }
    ]
  }
}
```

### parts[].machining_features[] (opsiyonel)

CNC geometrisi — IMOS Element karşılığı. MVP'de kullanılmaz ama saklanır (ileride parça önizlemesi, kalite kontrol için).

```json
{
  "feature_type": "groove" | "drill_hole" | "pocket" | "cut",
  "machining": "cut",
  "position": { "x": 0, "y": 308.65, "z": 19 },
  "end_position": { "x": 915, "y": 308.65, "z": 19 },
  "dimensions": { "width_mm": 13.7, "depth_mm": 9.5, "diameter_mm": null },
  "machine_code": "10203_ETQS500"
}
```

---

## Validation Kuralları

Contract MES'e geldiğinde şu kontrollerden geçer. Hata varsa **tüm import reddedilir** (atomic).

1. **Schema validation** — JSON Schema'ya uyum
2. **Version check** — `contract_version` destekleniyor mu
3. **Unique codes** — `work_order.code`, `project.code`, `modules[].code`, `sub_modules[].code`, `parts[].code`
4. **Reference integrity:**
   - Her `sub_module.module_code` modules[] içinde var mı
   - Her `part.module_code` modules[] içinde var mı
   - `part.sub_module_code` (varsa) sub_modules[] içinde var mı
   - Her `part.material_code` (manufactured) materials[] içinde var mı
   - Her `edges[].edge_band_code` edge_bands[] içinde var mı
   - Her `operations[].preferred_machine_code` ve `alternative_machine_codes[]` MES catalog'da (`mes.machines.code`) var mı — bilinmeyen kodda import reject (MES is authoritative; see `adapters-reference.md` § "MES Catalog Authority")
   - Aynı şekilde `parts[].current_station_code` (varsa) `mes.stations.code` içinde var mı
5. **Operation sequence** — aynı parça için sequence sıralı ve unique
6. **Part type consistency:**
   - `manufactured` → material_code + dimensions.cutting + dimensions.final dolu
   - `purchased_stock` → supplier dolu, dimensions/material/edges geçersiz
7. **Station enum validity** — bilinen station isimleri

---

## Idempotency

Aynı `work_order.code` ikinci kez gelirse: **409 Conflict** reject.

Revizyon akışı v3'te. Şimdilik supervisor manuel müdahale eder.

---

## Import Endpoint

```
POST /api/v1/import/contract
Content-Type: application/json
Authorization: Bearer <adapter_token>

Body: <yukarıdaki JSON>

Success (201):
{
  "work_order_id": "uuid",
  "project_id": "uuid",
  "modules_created": 22,
  "sub_modules_created": 158,
  "parts_created": 983,
  "materials_upserted": 5,
  "edge_bands_upserted": 3,
  "warnings": []
}

Validation error (400):
{
  "error": "schema_validation_failed",
  "details": [...]
}

Duplicate (409):
{
  "error": "duplicate_work_order",
  "existing_id": "uuid"
}
```

---

## Image Hosting

İki senaryo:

**Müşteri CDN'i var:** Contract'ta URL. MES fetch eder/cache'ler.

**Müşteri CDN'i yok:** Ayrı asset upload endpoint (v2.1'de).

MVP'de sadece URL.

---

## Program Dosyaları (CNC Files)

Contract sadece **referans** içerir (file_name, file_path, format). Asıl dosya transferi MVP'de MES'in işi değil — CAM ve makine arasında.

```json
{
  "file_name": "1135.mpr",
  "file_path": "D:\\NCDATA\\Stelumar\\CAM_Output\\BHX_560\\_cMES_Order\\...\\1135",
  "file_format": "homag_mpr",
  "barcode": "1135_01"
}
```

Operatör ekranında gösterilecek: "Bu parça BHX560'a git, barkod 1135_01'i tarat, program çalışsın." MES dosyayı transfer etmez, makine CAM'den okur.

v3'te: MES dosya transferini yönetebilir (SMB, FTP, Homag API).

---

## Kaynak Sistem Desteği

| Kaynak | Adapter durumu | Notlar |
|---|---|---|
| **IMOS** | ✓ Gerçek export analizi yapıldı | Primary reference (detaylar `adapters-reference.md`) |
| **Cabinet Vision** | ⏳ Henüz örnek yok | IMOS ile benzer yapı beklenir |
| **ERPNext BOM** | ⏳ Bekliyor | BOM bilgisi sınırlı, full CAD detayı yok — CAD ile complement edilir |
| **Manuel CSV** | ⏳ MVP'de basit template | Küçük fabrika, CAD yok senaryosu |
| **Custom** | ⏳ Müşteri bazında | Excel/XML/API — her birine adapter |

---

## Open Questions

1. **Element/machining_features coordinate sistemi**
   IMOS'un PosX/Y/Z nerede origin? Parça sol-alt köşesi? Dokümantasyon gerek. MVP'de 1:1 geçer, kullanılmıyor.

2. **Workflow kod tablosu**
   Homag workflow isimleri (`S_BS1_Edge2_BHX34_BHH_MLK_JP`) bir kataloga bağlansın mı? MVP'de hayır, metadata.

3. **Multi-export revizyon**
   Aynı order için IMOS'tan 2. export → şu an reject. Revizyon akışı v3.

4. **Part_type genişlemesi**
   IMOS'ta PartType=1 (manufactured) + PartType=15 (hardware) gördük. Diğer değerler var mı? Cabinet Vision gelince netleşir.

5. **Barkod hiyerarşisi ile ilişki**
   Parça barkodu IMOS'tan geliyor (`1135`). Pallet/module/project barkodları FactoryOS üretir. Namespace konvansiyonu ADR'ye bağlanacak.

---

## Demo Kullanımı

MVP demo senaryosunda:

1. Elle veya basit bir script ile `test-mutfak-001.json` oluştur (bu schema'ya göre)
2. `POST /api/v1/import/contract` ile yükle
3. Operatör ekranında modüller + sub_modüller + parçalar + kit'ler görünür
4. Üretim akışı: parça bazlı operasyonlar → sub_module montajı → paketleme
5. Müşteriye "IMOS bağlandığında aynısı otomatik" denir

IMOS'a gerek yok demo'da.

---

## Next Steps

1. ✅ Part Contract v2 tasarım (bu doküman)
2. ⏳ `adapters-reference.md` — IMOS mapping detayı + Windows-Linux köprü + ERP topology
3. ⏳ JSON Schema (formal validator dosyası)
4. ⏳ IMOS adapter prototipi (Node.js, `_cMES_Order.JSON` → contract JSON)
5. ⏳ Test fixture'ları (mini demo projeler)
6. ⏳ MES import endpoint implementation

---

## Versiyon Geçmişi

- **v1.0 (2026-04-23):** İlk teorik taslak
- **v1.1 (2026-04-23):** Barkod opsiyonel, image URL, operation details, module_operations
- **v2.0 (2026-04-24):** IMOS gerçek export analizi ile kalibre. sub_module hiyerarşisi, materials/edge_bands/machines top-level, multi-barcode, cutting/final dimensions, routing flexibility altyapı, hardware part_type ayrımı, machining_features opsiyonel.