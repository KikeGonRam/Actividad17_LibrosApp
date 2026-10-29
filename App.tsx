import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, Book, PAGE_SIZE, searchBooks } from './src/api/openLibrary';

export default function App() {
  const [input, setInput] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const lastQuery = useRef('');
  const page = useRef(1);
  const requestId = useRef(0);

  const runSearch = useCallback(async (query: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await searchBooks(query, 1);
      if (id !== requestId.current) return; // llegó una búsqueda más nueva
      lastQuery.current = query;
      page.current = 1;
      setBooks(result.books);
      setTotal(result.total);
      setSearched(true);
    } catch (e) {
      if (id !== requestId.current) return;
      setBooks([]);
      setTotal(0);
      setSearched(false);
      setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const onSubmit = () => {
    Keyboard.dismiss();
    runSearch(input);
  };

  const onRefresh = () => {
    if (lastQuery.current) runSearch(lastQuery.current);
  };

  const loadMore = async () => {
    if (loading || loadingMore || books.length === 0 || books.length >= total) return;
    setLoadingMore(true);
    try {
      const result = await searchBooks(lastQuery.current, page.current + 1);
      page.current += 1;
      setBooks((prev) => [...prev, ...result.books]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoadingMore(false);
    }
  };

  const renderItem = ({ item }: { item: Book }) => (
    <View style={styles.card}>
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.noCover]}>
          <Text style={styles.noCoverText}>Sin portada</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={3}>
          {item.title}
        </Text>
        <Text style={styles.line}>Autor: {item.authors}</Text>
        <Text style={styles.line}>Primera publicación: {item.year ?? 'N/D'}</Text>
        <Text style={styles.line}>Ediciones: {item.editions}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catálogo de Libros</Text>
        <Text style={styles.headerSub}>Datos de Open Library</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Título o autor (ej. Don Quijote)"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          maxLength={80}
          autoCorrect={false}
        />
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Buscar</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {lastQuery.current !== '' && (
            <Pressable onPress={onRefresh}>
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      )}

      {loading && books.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4a3b8f" />
          <Text style={styles.hint}>Buscando…</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            searched && books.length > 0 ? (
              <Text style={styles.count}>
                {total.toLocaleString('es-MX')} resultados (mostrando {books.length})
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            !error ? (
              <Text style={styles.hint}>
                {searched
                  ? 'No se encontraron libros para esa búsqueda.'
                  : 'Escribe un título o autor y presiona Buscar.'}
              </Text>
            ) : undefined
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : undefined}
        />
      )}
      <Text style={styles.footer}>
        Fuente: Open Library (openlibrary.org) · {PAGE_SIZE} por página
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f2fb' },
  header: { backgroundColor: '#4a3b8f', paddingTop: 36, paddingBottom: 14, paddingHorizontal: 16 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#d8d2f5', fontSize: 13 },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cfc9ea',
  },
  button: { backgroundColor: '#4a3b8f', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fde8e8',
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5b5b5',
  },
  errorText: { color: '#9b1c1c' },
  retry: { color: '#4a3b8f', fontWeight: '700', marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { textAlign: 'center', color: '#666', marginTop: 24, paddingHorizontal: 24 },
  list: { padding: 12, paddingBottom: 24 },
  count: { color: '#555', marginBottom: 8, fontSize: 12 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cover: { width: 64, height: 96, borderRadius: 4, backgroundColor: '#e6e3f3' },
  noCover: { alignItems: 'center', justifyContent: 'center' },
  noCoverText: { fontSize: 10, color: '#777', textAlign: 'center' },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 4 },
  line: { fontSize: 13, color: '#444', marginTop: 2 },
  footer: { textAlign: 'center', fontSize: 11, color: '#888', paddingVertical: 6 },
});
