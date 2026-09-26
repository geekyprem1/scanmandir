import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/auth/secure_session_storage.dart';
import 'package:scan_my_mandir/core/platform/platform_adapters.dart';

class _InMemorySecureStore implements SecureCredentialStore {
  final Map<String, String> values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);

  @override
  Future<void> clear() async => values.clear();
}

void main() {
  test(
    'persists and clears the Supabase session through the secure store',
    () async {
      final _InMemorySecureStore store = _InMemorySecureStore();
      final SecureSessionStorage session = SecureSessionStorage(store);

      expect(await session.hasAccessToken(), isFalse);
      expect(await session.accessToken(), isNull);

      await session.persistSession('{"access_token":"token-value"}');

      expect(await session.hasAccessToken(), isTrue);
      expect(await session.accessToken(), '{"access_token":"token-value"}');

      await session.removePersistedSession();

      expect(await session.hasAccessToken(), isFalse);
      expect(await session.accessToken(), isNull);
    },
  );

  test(
    'keeps the PKCE verifier in the secure store, under its own keys',
    () async {
      final _InMemorySecureStore store = _InMemorySecureStore();
      final SecurePkceStorage pkce = SecurePkceStorage(store);

      await pkce.setItem(key: 'verifier', value: 'verifier-value');

      expect(await pkce.getItem(key: 'verifier'), 'verifier-value');
      // Never the bare key: the session entry must not be reachable by accident.
      expect(store.values.containsKey('verifier'), isFalse);

      await pkce.removeItem(key: 'verifier');

      expect(await pkce.getItem(key: 'verifier'), isNull);
    },
  );
}
