/**
 * IMOS source format — kısmi tip tanımları.
 *
 * IMOS export'unda her alan string olarak gelir (sayılar dahil), boş alanlar "" olur.
 * Burada sadece kullanacağımız alanları tanımlıyoruz; bilinmeyen alanlar `unknown`
 * olarak akışa giremez ama JSON parse sonrası obje üzerinde durur — accessor'lar
 * gerektiğinde okur. Bu sayede IMOS yeni alan eklerse adapter kırılmaz.
 *
 * Hierarchy: order (Typ=0) → article (Typ=1) → assembly (Typ=2)
 *   → part (Typ=3 mfg | Typ=8 hardware) → material/edge/program/element
 *
 * NOT: ArticleNumber unique DEĞİL (W_2D fixture'da iki kez geçiyor); module
 * unique key her zaman `ID` olmalı.
 */

// IMOS'un type-key wrapper paterni: subelements bir array of single-key object.
// Örn: { article: {...} } | { assembly: {...} } | { part: {...} } | { material: {...} }
export interface ImosArticleSubelement {
  article: ImosArticle;
}

export interface ImosOrder {
  ArticleNumber: string;
  ID: string;
  "#OrderId": string;
  "#Typ": "0";
  subelements: ImosArticleSubelement[];
}

// Article (Typ=1) — domain'de "module" karşılığı. Order-level meta (date, address)
// her article'da tekrar; canonical kaynak articles[0] kabul edilir.
export interface ImosArticle {
  ID: string;
  ArticleNumber: string;
  "#ParentId": string;
  "#OrderId": string;
  "#Typ": "1";

  ArticleDescription?: string;
  ConstructionPrinciple?: string;

  // Order-level fields (her article'da kopyalanır, [0]'dan oku)
  OrderCreationDate?: string;       // "DD.MM.YYYY"
  OrderModificationDate?: string;   // "DD.MM.YYYY"
  DeliveryDate?: string;            // "DD.MM.YYYY" (boş olabilir)
  ShippingDate?: string;
  OrderDescriptionLong?: string;
  OrderDescriptionShort?: string;

  AddressFirstName?: string;
  AddressLastName?: string;
  AddressStreet?: string;
  AddressPostCode?: string;
  AddressTown?: string;
  AddressCountry?: string;

  Collection?: string;

  // Module dimensions/weight (modül parser'ında okunacak — şimdilik tip için var)
  Length?: string;
  Width?: string;
  Thickness?: string;
  Weight?: string;
  ArticleInfo1?: string;            // "Assembled" → is_assembled_at_factory

  // Sonraki adımlarda kullanılacak alt seviye (assembly[]) — şimdilik unknown
  subelements?: unknown[];
}

// Assembly (Typ=2) — domain'de "sub_module" karşılığı. ArticleNumber bu seviyede
// "Gable Right", "Gable Left" gibi anlamlı isim taşır (modüldeki gibi placeholder
// değil). #ParentId değeri parent article'ın ID'sidir.
export interface ImosAssembly {
  ID: string;
  ArticleNumber?: string;
  "#ParentId": string;
  "#OrderId"?: string;
  "#Typ": "2";
  subelements?: unknown[];
}

// Part — manufactured (Typ=3) ya da hardware (Typ=8). Aynı wrapper key
// ("part") ama #Typ değeri ayrım. Manufactured'da dimensions/material/edges
// dolu; hardware'da supplier dolu, dimensions null.
export interface ImosPart {
  ID: string;
  ArticleNumber?: string;
  ArticleDescription?: string;
  "#ParentId": string;
  "#OrderId"?: string;
  "#Typ": "3" | "8";
  PartType?: string;

  Barcode?: string;
  NcBarcode1?: string;
  NcBarcode2?: string;
  NcBarcode3?: string;

  CuttingLength?: string;
  CuttingWidth?: string;
  CuttingThickness?: string;
  Length?: string;
  Width?: string;
  Thickness?: string;

  GrainOrientation?: string;
  DesiredTargetQuantity?: string;

  CutFlag?: string;
  CncFlag?: string;
  BomFlag?: string;

  PartDefinition?: string;
  Checksum?: string;
  EdgeTransition?: string;

  // Hardware (Typ=8) için
  Supplier?: string;
  PurchaseOrderNumber?: string;
  Price?: string;

  // ProductionRoute string — operations parser bunu parse eder (6d adımı)
  ProductionRoute?: string;

  // material/edge/program/element subelements — şimdilik unknown
  subelements?: unknown[];
}

// IMOS root wrapper.
export interface ImosRoot {
  Version: string;
  order: ImosOrder;
}
