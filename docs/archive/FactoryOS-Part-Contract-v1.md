# FactoryOS Part Contract v1.1

> **Amaç:** Tüm dış sistemlerin (IMOS, ERPNext, Cabinet Vision, Homag IntelliDivide, CSV upload) MES'e ürün yapısı + iş emri + operasyonel detayları gönderirken uyacağı standart JSON format.
>
> **Prensip:** MES hiçbir kaynak formatını bilmez. Sadece bu contract'ı konuşur.

---

## v1.0 → v1.1 Değişiklikleri

- ✅ **Barkod opsiyonel alan eklendi** (default: kaynak sistem üretir, örn. Homag IntelliDivide)
- ✅ **Image URL referansları eklendi** (module ve part seviyesinde)
- ✅ **Operation details detaylandı** — machine_type, program_file, program_format
- ✅ **Assembly operation'ına kit listesi eklendi** (otomotiv kitting pattern'i)
- ✅ **Packaging operation'ına içerik + site assembly kit + shipping info eklendi**

---

## Yapı Kararları (v1.0'dan gelen)

1. **Granülarite:** Orta seviye. Proje üst bilgi + modül listesi + parça listesi düz liste. Hiyerarşi ID referanslarıyla.
2. **Kapsam:** Ürün yapısı + iş emri birlikte.
3. **Atomic import:** Bir contract = bir transaction.
4. **Versiyonlu:** `contract_version` zorunlu.

---

## Tam Schema (JSON örneği)

```json
{
  "contract_version": "1.1",
  "source": "imos",
  "source_ref": "imos-export-2026-04-23-001.xml",
  "imported_at": "2026-04-23T10:30:00Z",

  "work_order": {
    "code": "WO-2026-0423-001",
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
      "design_version": "v3"
    }
  },

  "modules": [
    {
      "code": "MUT-001-M05",
      "name": "Alt Dolap D3",
      "module_type": "base_cabinet_door",
      "width_mm": 600,
      "height_mm": 720,
      "depth_mm": 560,
      "position_ref": "worktop-center",
      "images": [
        {
          "type": "module_3d",
          "url": "https://cdn.customer.com/modules/D3-3d.png"
        },
        {
          "type": "assembly_guide",
          "url": "https://cdn.customer.com/modules/D3-assembly.pdf"
        }
      ],
      "metadata": {}
    }
  ],

  "parts": [
    {
      "code": "MUT-001-P012",
      "module_code": "MUT-001-M05",
      "description": "Sol yan panel",
      "part_type": "manufactured",
      "barcode": "IMOS-P012-MUT001",
      "material": {
        "code": "MDF18-WHITE",
        "name": "MDF 18mm Beyaz Melamin",
        "thickness_mm": 18
      },
      "dimensions": {
        "length_mm": 720,
        "width_mm": 560,
        "thickness_mm": 18
      },
      "quantity": 1,
      "images": [
        { "type": "part_drawing", "url": "https://cdn.customer.com/parts/P012.pdf" }
      ],
      "operations": [
        {
          "sequence": 1,
          "station": "cutting",
          "required": true,
          "details": {
            "machine_type": "homag_panel_saw",
            "program_file": "MUT001_P012.SAW",
            "program_format": "homag_saw",
            "optimization_ref": "intellidivide-opt-2026-0423-05"
          }
        },
        {
          "sequence": 2,
          "station": "banding",
          "required": true,
          "details": {
            "machine_type": "homag_edge_bander",
            "sides": ["front", "back", "top", "bottom"],
            "edge_material": "PVC2mm_WHITE",
            "edge_thickness_mm": 2
          }
        },
        {
          "sequence": 3,
          "station": "cnc",
          "required": true,
          "details": {
            "machine_type": "homag_cnc_router",
            "program_file": "MUT001_P012.MPR",
            "program_format": "homag_mpr",
            "operation_count": 8,
            "estimated_duration_sec": 120
          }
        },
        {
          "sequence": 4,
          "station": "assembly",
          "required": true,
          "details": {
            "module_ref": "MUT-001-M05"
          }
        },
        {
          "sequence": 5,
          "station": "packaging",
          "required": true,
          "details": {
            "module_ref": "MUT-001-M05"
          }
        }
      ],
      "metadata": {
        "cad_part_id": "imos-part-4321",
        "grain_direction": "vertical"
      }
    },

    {
      "code": "MUT-001-P089",
      "module_code": "MUT-001-M05",
      "description": "Blum menteşe B2040",
      "part_type": "purchased_stock",
      "supplier_code": "BLUM-B2040",
      "material": null,
      "dimensions": null,
      "quantity": 4,
      "operations": [
        {
          "sequence": 1,
          "station": "assembly",
          "required": true,
          "details": {
            "module_ref": "MUT-001-M05"
          }
        }
      ],
      "metadata": {}
    }
  ],

  "module_operations": [
    {
      "module_code": "MUT-001-M05",
      "sequence": 4,
      "station": "assembly",
      "details": {
        "kit": [
          { "part_code": "MUT-001-P012", "quantity": 1, "description": "Sol yan panel" },
          { "part_code": "MUT-001-P013", "quantity": 1, "description": "Sağ yan panel" },
          { "part_code": "MUT-001-P014", "quantity": 1, "description": "Alt panel" },
          { "part_code": "MUT-001-P015", "quantity": 1, "description": "Üst panel" },
          { "part_code": "MUT-001-P016", "quantity": 1, "description": "Arka panel" },
          { "part_code": "MUT-001-P089", "quantity": 4, "description": "Blum menteşe B2040" },
          { "part_code": "MUT-001-P090", "quantity": 8, "description": "5x30 vida" }
        ],
        "assembly_guide_url": "https://cdn.customer.com/modules/D3-assembly.pdf",
        "estimated_duration_sec": 600
      }
    },
    {
      "module_code": "MUT-001-M05",
      "sequence": 5,
      "station": "packaging",
      "details": {
        "contents": [
          {
            "item_type": "assembled_module",
            "ref": "MUT-001-M05",
            "description": "Alt Dolap D3"
          }
        ],
        "site_assembly_kit": [
          { "part_code": "SITE-001", "quantity": 1, "description": "Saha montaj kılavuzu" },
          { "part_code": "SITE-002", "quantity": 4, "description": "Duvar vidası 6x80" }
        ],
        "label_template": "shipping_label_v1",
        "shipping_info": {
          "customer_address": "İstanbul, Kadıköy, ...",
          "room_reference": "Mutfak - Çalışma tezgahı",
          "package_sequence": "3/12"
        },
        "destination_line": "shipping"
      }
    }
  ]
}
```

---

## Önemli Yapı Değişikliği: `module_operations`

Assembly ve packaging **parça bazlı değil, modül bazlı** işlemlerdir. Operatör bir modülü monte eder (birden fazla parça birleşir), bir modülü paketler.

Bu yüzden:
- `parts[].operations[]` — parçanın bireysel yolculuğu (kesim, bantlama, CNC)
- `module_operations[]` — modül bazlı operasyonlar (assembly, packaging)

Parçalar assembly'ye "gidiyor" ama assembly operation'ı **modül**e ait — operatör 7 parçayı alıp 1 modül yapıyor.

Bu ayrım otomotivle uyumlu: **preparation = parça bazlı, assembly = modül bazlı.**

---

## Alan Açıklamaları — Değişenler

### parts[].barcode (YENİ, opsiyonel)

Kaynak sistem (IMOS, Homag IntelliDivide) üretiyorsa dolu gelir. Yoksa MES kesim sonrası üretir.

### parts[].images, modules[].images (YENİ, opsiyonel)

```json
{
  "type": "module_3d" | "assembly_guide" | "part_drawing" | "exploded_view",
  "url": "https://..."
}
```

URL referansları. Müşteride CDN yoksa MES kendi file storage'ına upload edilebilir (ayrı endpoint).

### parts[].operations[].details — Station-özel

#### cutting
```json
{
  "machine_type": "homag_panel_saw" | "biesse_panel_saw" | "generic",
  "program_file": "MUT001_P012.SAW",
  "program_format": "homag_saw" | "homag_ptx" | "biesse_xnc" | "csv",
  "optimization_ref": "intellidivide-opt-2026-0423-05"
}
```

#### banding
```json
{
  "machine_type": "homag_edge_bander" | "manual",
  "sides": ["front", "back", "top", "bottom"],   // hangi kenarlar
  "edge_material": "PVC2mm_WHITE",
  "edge_thickness_mm": 2
}
```

#### cnc
```json
{
  "machine_type": "homag_cnc_router" | "biesse_rover" | "manual",
  "program_file": "MUT001_P012.MPR",
  "program_format": "homag_mpr" | "homag_mprx" | "biesse_xnc",
  "operation_count": 8,
  "estimated_duration_sec": 120
}
```

#### assembly (parts level — sadece referans)
```json
{
  "module_ref": "MUT-001-M05"
}
```
Detay `module_operations[]` içinde.

#### packaging (parts level — sadece referans)
```json
{
  "module_ref": "MUT-001-M05"
}
```
Detay `module_operations[]` içinde.

### module_operations[] (YENİ)

Modül seviyesinde operasyonlar.

#### assembly
```json
{
  "module_code": "MUT-001-M05",
  "sequence": 4,
  "station": "assembly",
  "details": {
    "kit": [{ "part_code": "...", "quantity": N, "description": "..." }],
    "assembly_guide_url": "...",
    "estimated_duration_sec": 600
  }
}
```

**Neden kit listesi açıkça belirtiliyor:**
- Operatör ekranında tam olarak bunu gösterebilmek için
- Eksik parça kontrolü (kit hazır mı?) bu listeden yapılır
- Değişiklik durumunda tek yerden güncellemek için

#### packaging
```json
{
  "module_code": "...",
  "sequence": 5,
  "station": "packaging",
  "details": {
    "contents": [
      { "item_type": "assembled_module" | "disassembled_parts", "ref": "...", "description": "..." }
    ],
    "site_assembly_kit": [{ "part_code": "...", "quantity": N }],
    "label_template": "shipping_label_v1",
    "shipping_info": {
      "customer_address": "...",
      "room_reference": "...",    // "Mutfak - Çalışma tezgahı"
      "package_sequence": "3/12"  // 12 paketten 3'ü
    },
    "destination_line": "shipping" | "site_installation"
  }
}
```

**Semi-assembly senaryosu:**
Büyük dolaplar parçalarına ayrılıp paketlenir. `contents.item_type = "disassembled_parts"` olur. Site kit'inde saha montaj talimatı + gerekli parçalar.

---

## Validation Kuralları

1. Schema validation (JSON Schema'ya uyum)
2. Version check (`contract_version` destekleniyor mu?)
3. Unique codes (`work_order.code`, `project.code`, `modules[].code`, `parts[].code`)
4. Reference integrity:
   - Her `part.module_code` modules[] içinde var mı
   - Her `module_operations[].module_code` modules[] içinde var mı
   - Kit içindeki `part_code` referansları parts[] içinde var mı (satınalma parçaları dahil)
5. Operation sequence sıralı ve unique mi (aynı parça için)
6. Part type consistency:
   - `manufactured` → material + dimensions dolu
   - `purchased_stock` → supplier_code dolu, material/dimensions null olabilir
7. Station enum values (cutting, banding, cnc, assembly, packaging)

---

## Idempotency

MVP: Aynı `work_order.code` ikinci kez gelirse **409 Conflict** reject.

Revizyon akışı v2'de. Şimdilik supervisor manuel müdahale eder.

---

## Image Hosting

İki senaryo:

**Senaryo A — Müşteri CDN'i var:**
Contract'ta URL. MES fetch eder, cache'ler veya redirect eder.

**Senaryo B — Müşteri CDN'i yok:**
Ayrı asset upload endpoint'i:
```
POST /api/v1/assets/upload
Multipart form data, döner: { "url": "https://mes.customer.com/assets/..." }
```
Sonra bu URL contract'ta kullanılır.

MVP'de sadece URL desteği. Upload endpoint v1.2'de.

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
  "modules_created": 14,
  "parts_created": 47,
  "module_operations_created": 28,
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

## Açık Sorular (v1.1'den sonra)

1. **Program dosyaları nasıl geliyor?**  
   Contract'ta sadece referans (`"program_file": "MUT001_P012.SAW"`). Asıl dosya nerede? Ayrı upload mı, zip package mı, URL mi?  
   → v1.2'de karar verilecek. MVP'de sadece referans string.

2. **Kit otomatik hesaplama**  
   Assembly kit'i manuel contract'a mı yazılsın, yoksa MES modül'ün tüm parçalarından otomatik mi üretsin?  
   → Şu an contract'ta manuel. Otomatik hesap opsiyonu v1.2'de.

3. **Revizyon akışı**  
   IMOS'tan yeni export geldiğinde mevcut WO'nun davranışı.  
   → Şimdilik 409 reject. Revizyon v2.

4. **Station esnek liste**  
   Müşteri özel istasyon tipi isteyebilir (çapak alma, boya vs.).  
   → MVP'de sabit. Esneklik v1.3'te.

5. **Multi-line assembly hint**  
   Modül hangi montaj hattına gidecek?  
   → v1.3'te `modules[].preferred_line` alanı.

---

## Demo Kullanımı

1. Elle test contract dosyaları hazırla (`test-mutfak-001.json`, `test-dolap-002.json`)
2. Postman/curl ile import et
3. Operatör ekranında parçalar + kit'ler + görseller görünür
4. Üretim akışı çalışır
5. Müşteriye "IMOS bağlandığında otomatik" denir

---

## Versiyon Geçmişi

- **v1.0 (2026-04-23):** İlk taslak. Temel yapı.
- **v1.1 (2026-04-23):** Barkod opsiyonel, image URL'leri, operation details (Homag formatları), module_operations ayrımı (assembly/packaging), otomotiv kitting pattern'i.
