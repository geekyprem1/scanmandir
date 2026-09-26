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
