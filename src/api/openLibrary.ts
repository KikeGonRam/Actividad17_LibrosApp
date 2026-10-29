// Cliente de la API de Open Library (https://openlibrary.org/dev/docs/api/search)
// Sin dependencias de React Native para poder probarlo con Node directamente.

export const BASE_URL = 'https://openlibrary.org';
export const TIMEOUT_MS = 10000;
export const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 80;

export interface Book {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  editions: number;
  coverUrl: string | null;
}

export interface SearchResult {
  total: number;
  books: Book[];
}

export type ApiErrorCode =
  | 'INVALID_QUERY'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'SERVER'
  | 'BAD_RESPONSE';

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Valida y normaliza el texto de búsqueda. Lanza ApiError si no es válido. */
export function validateQuery(raw: string): string {
  const q = raw.replace(/\s+/g, ' ').trim();
  if (q.length < 2) {
    throw new ApiError('INVALID_QUERY', 'Escribe al menos 2 caracteres para buscar.');
  }
  if (q.length > MAX_QUERY_LENGTH) {
    throw new ApiError('INVALID_QUERY', `La búsqueda no puede pasar de ${MAX_QUERY_LENGTH} caracteres.`);
  }
  // Solo letras (con acentos), números, espacios y signos básicos de títulos.
  if (!/^[\p{L}\p{N} .,'’:!?&-]+$/u.test(q)) {
    throw new ApiError('INVALID_QUERY', 'La búsqueda contiene caracteres no permitidos.');
  }
  return q;
}

/** Convierte un documento crudo de la API en un Book, o null si no sirve. */
export function mapDoc(doc: any): Book | null {
  if (!doc || typeof doc.key !== 'string' || typeof doc.title !== 'string') return null;
  const authors =
    Array.isArray(doc.author_name) && doc.author_name.length > 0
      ? doc.author_name.slice(0, 3).join(', ')
      : 'Autor desconocido';
  return {
    id: doc.key,
    title: doc.title,
    authors,
    year: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
    editions: typeof doc.edition_count === 'number' ? doc.edition_count : 0,
    coverUrl:
      typeof doc.cover_i === 'number'
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null,
  };
}

export async function searchBooks(
  rawQuery: string,
  page = 1,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult> {
  const q = validateQuery(rawQuery);
  const params = new URLSearchParams({
    q,
    limit: String(PAGE_SIZE),
    page: String(page),
    fields: 'key,title,author_name,first_publish_year,cover_i,edition_count',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchImpl(`${BASE_URL}/search.json?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'El servidor tardó demasiado en responder. Intenta de nuevo.');
    }
    throw new ApiError('NETWORK', 'No hay conexión a internet o el servicio no es alcanzable.');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new ApiError('RATE_LIMIT', 'Demasiadas solicitudes. Espera unos segundos e intenta otra vez.');
  }
  if (!res.ok) {
    throw new ApiError('SERVER', `El servicio respondió con error (HTTP ${res.status}).`);
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'La respuesta del servicio no tiene un formato válido.');
  }
  if (!json || !Array.isArray(json.docs)) {
    throw new ApiError('BAD_RESPONSE', 'La respuesta del servicio no tiene un formato válido.');
  }

  const books = json.docs.map(mapDoc).filter((b: Book | null): b is Book => b !== null);
  return { total: typeof json.numFound === 'number' ? json.numFound : books.length, books };
}
