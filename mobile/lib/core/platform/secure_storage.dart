import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'platform_adapters.dart';

/// Keystore-backed credential storage.
///
/// Implements the platform boundary declared in [SecureCredentialStore]. Session tokens
/// must never be written to the SQLite cache or to shared preferences
/// (ARCHITECTURE.md section 4), so every credential — including the Supabase session and
/// its PKCE verifier — goes through this store.
class FlutterSecureCredentialStore implements SecureCredentialStore {
  FlutterSecureCredentialStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);

  @override
  Future<void> clear() => _storage.deleteAll();
}
