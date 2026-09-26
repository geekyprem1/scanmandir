import 'package:supabase_flutter/supabase_flutter.dart';

import '../model/failure.dart';

/// The identity behind the current session.
///
/// `userId` is the Supabase user id. It survives the guest-to-account upgrade, which is
/// what lets a guest keep their history after signing in (docs/decisions.md D-15).
class SessionIdentity {
  const SessionIdentity({required this.userId, required this.isAnonymous});

  final String userId;
  final bool isAnonymous;
}

/// Identity operations the app depends on.
///
/// An interface rather than a direct Supabase call so screens and controllers stay
/// testable without a network, and so Supabase types stay behind this boundary
/// (ARCHITECTURE.md section 4).
abstract interface class AuthService {
  /// The session restored from secure storage, if there is one.
  SessionIdentity? get currentSession;

  /// Creates an anonymous guest session (PRD section 7: the first scan needs no account).
  Future<SessionIdentity> signInAsGuest();

  /// A bearer token for backend calls, or null when there is no session.
  ///
  /// Kept out of [SessionIdentity] on purpose: identity is displayed, a credential is
  /// not. Callers ask for the token at the moment of the call.
  Future<String?> accessToken();

  /// Refreshes the session and returns a fresh token, or null when there is no session
  /// or the refresh was refused.
  Future<String?> refreshedAccessToken();
}

class SupabaseAuthService implements AuthService {
  SupabaseAuthService(this._client);

  final SupabaseClient _client;

  @override
  SessionIdentity? get currentSession {
    final Session? session = _client.auth.currentSession;
    if (session == null) {
      return null;
    }
    return SessionIdentity(
      userId: session.user.id,
      isAnonymous: session.user.isAnonymous,
    );
  }

  @override
  Future<SessionIdentity> signInAsGuest() async {
    final AuthResponse response = await _client.auth.signInAnonymously();
    final User? user = response.user;
    if (user == null) {
      throw const AuthException('Anonymous sign-in returned no user.');
    }
    return SessionIdentity(userId: user.id, isAnonymous: user.isAnonymous);
  }

  @override
  Future<String?> accessToken() async =>
      _client.auth.currentSession?.accessToken;

  @override
  Future<String?> refreshedAccessToken() async {
    try {
      final AuthResponse response = await _client.auth.refreshSession();
      return response.session?.accessToken;
    } on AuthException {
      // A refused refresh means the session is gone, not that the app is broken. The
      // caller treats a null token as "sign in again".
      return null;
    }
  }
}

/// Maps an auth failure onto the app's own failure vocabulary, so screens never branch
/// on Supabase exception types.
Failure failureFromAuthError(Object error) {
  if (error is AuthRetryableFetchException) {
    return Failure(kind: FailureKind.network, debugMessage: error.message);
  }
  if (error is AuthException) {
    return Failure(
      kind: FailureKind.unknown,
      code: error.code,
      debugMessage: error.message,
    );
  }
  return Failure(kind: FailureKind.unknown, debugMessage: error.toString());
}
