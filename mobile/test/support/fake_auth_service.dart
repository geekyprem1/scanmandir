import 'package:scan_my_mandir/core/auth/auth_service.dart';

/// Auth service for widget tests: no network, no Supabase, no platform channels.
class FakeAuthService implements AuthService {
  FakeAuthService({this.restored, this.failure});

  /// A session that was already persisted, when the test models a returning user.
  final SessionIdentity? restored;

  /// When set, [signInAsGuest] throws it instead of returning an identity.
  final Object? failure;

  int guestSignIns = 0;

  @override
  SessionIdentity? get currentSession => restored;

  @override
  Future<SessionIdentity> signInAsGuest() async {
    guestSignIns++;
    final Object? error = failure;
    if (error != null) {
      throw error;
    }
    return const SessionIdentity(userId: 'test-guest-user', isAnonymous: true);
  }
}
