import type { ImosRoot, ImosArticle } from "../types.js";
import { parseImosDate, nullIfBlank, joinAddressParts } from "../utils.js";
import { logger } from "../../../lib/logger.js";

/**
 * IMOS order/article header → Part Contract v2 work_order + project.
 *
 * Article-level alanlar (Address*, *Date, OrderDescriptionLong, Collection)
 * her article'da kopya — articles[0] canonical kabul edilir. Bu fixture
 * Address* alanlarını tamamen "" gönderiyor; customer_name fallback'i
 * "Unknown Customer" + warning (Atalay'ın A kararı).
 */

export type ProjectType = "kitchen" | "bathroom" | "wardrobe" | "shop" | "other";

export interface ContractWorkOrder {
  code: string;
  customer_name: string;
  customer_address: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  planned_start_date: string | null;
  planned_end_date: string | null;
  notes: string | null;
}

export interface ContractProject {
  code: string;
  name: string;
  type: ProjectType;
  metadata: Record<string, unknown>;
}

export interface OrderParseResult {
  work_order: ContractWorkOrder;
  project: ContractProject;
}

// Müşteri "kitchen"/"bathroom" gibi standart kategori kullanmıyorsa "other".
// Hardcoded eşleşme yerine fuzzy contains: IMOS Collection alanı serbest metin.
const KNOWN_PROJECT_TYPES: readonly ProjectType[] = [
  "kitchen",
  "bathroom",
  "wardrobe",
  "shop",
];

function inferProjectType(collection: string | undefined): ProjectType {
  const lower = (collection ?? "").toLowerCase();
  for (const t of KNOWN_PROJECT_TYPES) {
    if (lower.includes(t)) return t;
  }
  return "other";
}

function buildCustomerName(article: ImosArticle, orderId: string): string {
  const first = nullIfBlank(article.AddressFirstName);
  const last = nullIfBlank(article.AddressLastName);
  if (first || last) {
    return [first, last].filter(Boolean).join(" ");
  }
  // Boşsa import'u durdurmuyoruz; warning + placeholder ile devam.
  // Supervisor UI'da "müşteri eksik" olarak görünür ve elle düzeltilir.
  logger.warn(
    { order_id: orderId },
    "imos: customer name missing — using placeholder",
  );
  return "Unknown Customer";
}

export function parseOrder(root: ImosRoot): OrderParseResult {
  const order = root.order;
  const header = order.subelements?.[0]?.article;
  if (!header) {
    throw new Error("imos_order_has_no_articles");
  }

  const work_order: ContractWorkOrder = {
    code: order.ID,
    customer_name: buildCustomerName(header, order.ID),
    customer_address: joinAddressParts([
      header.AddressStreet,
      header.AddressPostCode,
      header.AddressTown,
      header.AddressCountry,
    ]),
    priority: "normal",
    planned_start_date: null,
    planned_end_date: parseImosDate(header.DeliveryDate),
    notes: nullIfBlank(header.OrderDescriptionLong),
  };

  const project: ContractProject = {
    code: order.ID,
    name: nullIfBlank(order.ArticleNumber) ?? order.ID,
    type: inferProjectType(header.Collection),
    metadata: {
      source: "imos",
      source_order_id: order["#OrderId"],
      order_creation_date: parseImosDate(header.OrderCreationDate),
      order_modification_date: parseImosDate(header.OrderModificationDate),
    },
  };

  return { work_order, project };
}
