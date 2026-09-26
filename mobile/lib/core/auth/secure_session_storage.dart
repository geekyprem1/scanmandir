import 'package:supabase_flutter/supabase_flutter.dart';

import '../platform/platform_adapters.dart';

/// Session persistence for Supabase, on top of [SecureCredentialStore].
///
/// Supabase's own default writes the whole session — access and refresh tokens — into
/// shared preferences. ARCHITECTURE.md section 4 forbids exactly that, so both storage
/// hooks are redirected here: the session itself and the PKCE verifier used by OAuth
/// flows. Sessions therefore survive app restarts (the guest history promise in PRD
/// section 7) while staying in keystore-backed storage.
class SecureSessionStorage extends LocalStorage {
  SecureSessionStorage(this._store);

  final SecureCredentialStore _store;

  /// One entry holding the session JSON Supabase persists.
  static const String sessionKey = 'supabase_session';

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async => await _store.read(sessionKey) != null;

  @override
  Future<String?> accessToken() => _store.read(sessionKey);

  @override
  Future<void> persistSession(String persistSessionString) =>
      _store.write(sessionKey, persistSessionString);

  @override
  Future<void> removePersistedSession() => _store.delete(sessionKey);
}

/// PKCE verifier storage for OAuth flows, on the same secure store.
class SecurePkceStorage extends GotrueAsyncStorage {
  SecurePkceStorage(this._store);

  final SecureCredentialStore _store;

  static const String _prefix = 'supabase_pkce_';

  @override
  Future<String?> getItem({required String key}) => _store.read('$_prefix$key');

  @override
  Future<void> setItem({required String key, required String value}) =>
      _store.write('$_prefix$key', value);

  @override
  Future<void> removeItem({required String key}) =>
      _store.delete('$_prefix$key');
}
