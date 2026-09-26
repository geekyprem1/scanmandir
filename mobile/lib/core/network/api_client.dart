import '../environment.dart';
import 'error_mapping.dart';
import 'http_transport.dart';

class BackendHealth {
  const BackendHealth({required this.ready, required this.checks});

  final bool ready;
  final Map<String, String> checks;
}

/// Thin client over the backend.
///
/// Only the health endpoints exist so far, which is deliberate: the backend has no
/// authentication yet (P3-01) and no route that touches user data. This class exists to
/// prove the wiring — environment, transport, error mapping, controller state — before
/// any real endpoint is added.
class ApiClient {
  ApiClient({required this.environment, required this._transport});

  final Environment environment;
  final HttpTransport _transport;

  Uri _resolve(String path) => environment.apiBaseUrl.resolve(path);

  /// Liveness. Throws [TransportException] when the server cannot be reached at all.
  Future<bool> checkAlive() async {
    final HttpOutcome outcome = await _transport.get(_resolve('/health'));
    if (!outcome.isSuccess) {
      throw TransportException(failureFromOutcome(outcome));
    }
    return outcome.jsonObject?['status'] == 'ok';
  }

  /// Readiness, including the backend's own dependency checks.
  Future<BackendHealth> checkReady() async {
    final HttpOutcome outcome = await _transport.get(_resolve('/health/ready'));
    final Map<String, Object?>? body = outcome.jsonObject;

    // A 503 here is a valid, informative answer rather than an error: it reports which
    // dependency is down.
    if (body == null) {
      throw TransportException(failureFromOutcome(outcome));
    }

    final Object? rawChecks = body['checks'];
    final Map<String, String> checks = rawChecks is Map<String, Object?>
        ? rawChecks.map(
            (String key, Object? value) =>
                MapEntry<String, String>(key, '$value'),
          )
        : const <String, String>{};

    return BackendHealth(ready: body['status'] == 'ready', checks: checks);
  }
}
