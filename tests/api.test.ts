// Pruebas del cliente de Open Library. Ejecutar con:
//   node --experimental-strip-types tests/api.test.ts
import { ApiError, searchBooks, validateQuery } from '../src/api/openLibrary.ts';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -> ' + detail : ''}`);
  if (!ok) failed++;
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof ApiError ? e.code : 'OTHER';
  }
}

const fakeRes = (status: number, body: unknown, jsonFails = false) =>
  (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (jsonFails) throw new Error('bad json');
      return body;
    },
  })) as unknown as typeof fetch;

// --- Caso 1: búsqueda real con resultados ---
const r1 = await searchBooks('tolkien');
check('C1 búsqueda "tolkien" devuelve resultados', r1.books.length > 0, `total=${r1.total}, mostrados=${r1.books.length}`);
const b = r1.books[0];
console.log('     Primer resultado:', JSON.stringify(b));
check('C1 cada libro trae título y autor', r1.books.every((x) => x.title && x.authors));

// --- Caso 2: búsqueda real sin resultados (respuesta vacía) ---
const r2 = await searchBooks('zxqwvkjhg');
check('C2 búsqueda sin coincidencias devuelve lista vacía', r2.books.length === 0 && r2.total === 0, `total=${r2.total}`);

// --- Validación de parámetros ---
const v = (s: string) => codeOf(Promise.resolve().then(() => validateQuery(s)));
check('V1 vacío rechazado', (await v('   ')) === 'INVALID_QUERY');
check('V2 un solo carácter rechazado', (await v('a')) === 'INVALID_QUERY');
check('V3 caracteres peligrosos rechazados', (await v('<script>alert(1)</script>')) === 'INVALID_QUERY');
check('V4 texto muy largo rechazado', (await v('a'.repeat(81))) === 'INVALID_QUERY');
check('V5 acentos y espacios extra normalizados', validateQuery('  García   Márquez ') === 'García Márquez');

// --- Errores simulados ---
check('E1 HTTP 429 -> RATE_LIMIT', (await codeOf(searchBooks('java', 1, fakeRes(429, {})))) === 'RATE_LIMIT');
check('E2 HTTP 503 -> SERVER', (await codeOf(searchBooks('java', 1, fakeRes(503, {})))) === 'SERVER');
const noNet = (async () => {
  throw new TypeError('Network request failed');
}) as unknown as typeof fetch;
check('E3 sin red -> NETWORK', (await codeOf(searchBooks('java', 1, noNet))) === 'NETWORK');
check('E4 JSON inválido -> BAD_RESPONSE', (await codeOf(searchBooks('java', 1, fakeRes(200, null, true)))) === 'BAD_RESPONSE');
check('E5 JSON sin "docs" -> BAD_RESPONSE', (await codeOf(searchBooks('java', 1, fakeRes(200, { foo: 1 })))) === 'BAD_RESPONSE');
const r3 = await searchBooks('java', 1, fakeRes(200, { numFound: 2, docs: [{ key: '/works/X', title: 'Libro sin autor' }, { basura: true }] }));
check('E6 documentos incompletos se omiten/rellenan', r3.books.length === 1 && r3.books[0].authors === 'Autor desconocido');

console.log(failed === 0 ? '\nTodas las pruebas pasaron.' : `\n${failed} prueba(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
