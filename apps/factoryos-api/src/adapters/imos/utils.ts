/**
 * IMOS adapter — paylaşılan dönüştürücüler.
 */

/**
 * IMOS tarihleri "DD.MM.YYYY" formatında, boş alan da "" olarak gelir.
 * ISO date string'e çevirir; boş/geçersiz girdi için null döner ki contract'a
 * "yok" olarak gidebilsin (planned_*_date gibi alanlar zaten optional).
 *
 * Strict regex: ay/gün range kontrolü Postgres'e bırakılır (DATE column zaten
 * geçersiz değer kabul etmez). Burada amaç format dönüşümü, validation değil.
 */
export function parseImosDate(input: string | undefined): string | null {
  if (!input) return null;
  const m = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * IMOS export'ta optional string alanlar "" olarak gelir.
 * Boş/whitespace-only string'i null'a çevirir; uygulama kodu sadece
 * "değer var/yok" üzerinden düşünür.
 */
export function nullIfBlank(input: string | undefined): string | null {
  if (input === undefined) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Adres parçalarını birleştirir (boşları atlayarak); hepsi boşsa null.
 * IMOS bu fixture'da hepsini "" gönderiyor; adres satırı oluşamaz, null döner.
 */
export function joinAddressParts(
  parts: Array<string | undefined>,
): string | null {
  const cleaned = parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return cleaned.length === 0 ? null : cleaned.join(", ");
}

/**
 * IMOS export "wrapper key + payload" paterni: subelements her elemanı
 * `{ article: {..., #Typ: "1", subelements: [...] } }` gibi tek anahtarlı
 * obje. Bu generator ağaç boyunca tüm payload'ları (article/assembly/part/
 * material/edge/program/element) sırayla yield eder; consumer wrapperKey'e
 * göre filtreler. Tek tarama, tüm tipler.
 */
export function* walkPayloads(
  node: unknown,
): Generator<{ wrapperKey: string; payload: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walkPayloads(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "#Typ" in (value as Record<string, unknown>)
    ) {
      const payload = value as Record<string, unknown>;
      yield { wrapperKey: key, payload };
      if (Array.isArray(payload.subelements)) {
        yield* walkPayloads(payload.subelements);
      }
    }
  }
}

/**
 * walkPayloads'tan tek tipte payload toplar (ör. "material", "edge").
 * Sıra: kaynak dosyadaki encounter sırası. Dedupe consumer'da yapılır.
 */
export function collectByKey<T>(root: unknown, wrapperKey: string): T[] {
  const out: T[] = [];
  for (const { wrapperKey: k, payload } of walkPayloads(root)) {
    if (k === wrapperKey) out.push(payload as T);
  }
  return out;
}

/**
 * Tek bir node'un (part, assembly, ...) doğrudan altındaki subelement'lardan
 * verilen wrapper-key'lileri çıkarır. Recursive değil — sadece bir seviye derin.
 * Part-level material/edge/program/element çıkarımı için kullanılır.
 */
export function findPartSubelements<T>(
  node: { subelements?: unknown[] },
  wrapperKey: string,
): T[] {
  if (!Array.isArray(node.subelements)) return [];
  const out: T[] = [];
  for (const sub of node.subelements) {
    if (sub && typeof sub === "object" && wrapperKey in sub) {
      out.push((sub as Record<string, unknown>)[wrapperKey] as T);
    }
  }
  return out;
}
