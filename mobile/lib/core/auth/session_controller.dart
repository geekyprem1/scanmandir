import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../model/failure.dart';
import 'auth_service.dart';

/// The Supabase-backed auth service.
///
/// `Supabase.initialize` runs in `main`, so the instance exists by the time any provider
/// reads this. Tests override the provider with a fake instead of initializing Supabase.
final Provider<AuthService> authServiceProvider = Provider<AuthService>(
  (Ref ref) => SupabaseAuthService(Supabase.instance.client),
);

/// Where the app is in the session lifecycle.
///
/// Restoring is not a state: Supabase recovers the persisted session during
/// `initialize`, so [SessionController.build] can answer synchronously. Only starting a
/// new guest session is asynchronous.
sealed class SessionUiState {
  const SessionUiState();
}

final class SessionSignedOut extends SessionUiState {
  const SessionSignedOut();
}

final class SessionStarting extends SessionUiState {
  const SessionStarting();
}

final class SessionSignedIn extends SessionUiState {
  const SessionSignedIn(this.identity);
  final SessionIdentity identity;
}

final class SessionFailed extends SessionUiState {
  const SessionFailed(this.failure);
  final Failure failure;
}

/// Owns the app's identity state: the restored session, or a guest session started on
/// demand. Nothing here is automatic — the PRD asks for a session when the scan needs
/// one, not a network call at launch.
class SessionController extends Notifier<SessionUiState> {
  @override
  SessionUiState build() {
    final AuthService auth = ref.watch(authServiceProvider);
    final SessionIdentity? restored = auth.currentSession;
    return restored == null
        ? const SessionSignedOut()
        : SessionSignedIn(restored);
  }

  Future<void> startGuestSession() async {
    state = const SessionStarting();
    try {
      final SessionIdentity identity = await ref
          .read(authServiceProvider)
          .signInAsGuest();
      state = SessionSignedIn(identity);
    } on Object catch (error) {
      // Reported rather than swallowed; the tile offers a retry.
      state = SessionFailed(failureFromAuthError(error));
    }
  }
}

final NotifierProvider<SessionController, SessionUiState>
sessionControllerProvider = NotifierProvider<SessionController, SessionUiState>(
  SessionController.new,
);
