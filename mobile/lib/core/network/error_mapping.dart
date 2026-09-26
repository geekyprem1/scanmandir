import '../model/failure.dart';
import 'http_transport.dart';

/// Reads the server's documented error envelope into the app's failure vocabulary.
///
/// Every client maps errors through this, so a screen never branches on HTTP status
/// codes and the set of codes the app understands stays in one place.
Failure failureFromOutcome(HttpOutcome outcome) {
  final Object? error = outcome.jsonObject?['error'];
  if (error is Map<String, Object?>) {
    final Object? code = error['code'];
    if (code is String) {
      return Failure.fromCode(code, debugMessage: 'HTTP ${outcome.statusCode}');
    }
  }
  return Failure(
    kind: outcome.statusCode >= 500 ? FailureKind.server : FailureKind.unknown,
    debugMessage: 'HTTP ${outcome.statusCode}',
  );
}
