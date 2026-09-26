import 'package:scan_my_mandir/core/auth/auth_service.dart';

/// Auth service for widget tests: no network, no Supabase, no platform channels.
class FakeAuthService implements AuthService {
  FakeAuthService({
    this.restored,
    this.failure,
    this.token = 'test-access-token',
    this.refreshedToken,
  });

  /// A session that was already persisted, when the test models a returning user.
  final SessionIdentity? restored;

  /// When set, [signInAsGuest] throws it instead of returning an identity.
  final Object? failure;

  /// What [accessToken] answers. Null models a signed-out app.
  final String? token;

  /// What [refreshedAccessToken] answers. Null models a session that cannot be renewed.
  final String? refreshedToken;

  int guestSignIns = 0;
  int refreshes = 0;

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

  @override
  Future<String?> accessToken() async => token;

  @override
  Future<String?> refreshedAccessToken() async {
    refreshes++;
    return refreshedToken;
  }
}
