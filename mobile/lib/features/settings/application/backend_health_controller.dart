import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/http_transport.dart';
import '../../../core/providers.dart';

/// Reports whether the backend is reachable.
///
/// This is a developer-facing check, not a user feature, and it is the first controller
/// in the app on purpose: it exercises the full path — provider wiring, transport, error
/// mapping, and all four UI states — before any real endpoint exists to get it wrong.
class BackendHealthController extends Notifier<UiState<BackendHealth>> {
  @override
  UiState<BackendHealth> build() {
    // Kick off the first check without blocking the build.
    Future<void>.microtask(refresh);
    return const UiLoading<BackendHealth>();
  }

  Future<void> refresh() async {
    state = const UiLoading<BackendHealth>();
    final ApiClient client = ref.read(apiClientProvider);

    try {
      final BackendHealth health = await client.checkReady();
      state = UiContent<BackendHealth>(health);
    } on TransportException catch (error) {
      state = errorStateFor<BackendHealth>(error.failure);
    } on Object catch (error) {
      // Anything unexpected is reported rather than swallowed, and is treated as
      // recoverable so the user is offered a retry.
      state = errorStateFor<BackendHealth>(
        Failure(kind: FailureKind.unknown, debugMessage: error.toString()),
      );
    }
  }
}

final NotifierProvider<BackendHealthController, UiState<BackendHealth>>
backendHealthProvider =
    NotifierProvider<BackendHealthController, UiState<BackendHealth>>(
      BackendHealthController.new,
    );
