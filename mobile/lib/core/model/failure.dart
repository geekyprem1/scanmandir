/// How a failure should be handled, independent of the exact backend code.
///
/// The UI decides what to offer the user from this: retry, re-authenticate, retake a
/// photo, or stop. Backend codes are kept alongside for diagnosis and for mapping to
/// localized text.
enum FailureKind {
  /// No connectivity, DNS failure, connection refused.
  network,

  /// The request was sent but no answer arrived in time.
  timeout,

  /// The server answered with a fault of its own.
  server,

  /// Session missing or rejected.
  unauthenticated,

  /// Authenticated, but not permitted.
  forbidden,

  notFound,

  /// Someone else's edit landed first; re-read before retrying.
  revisionConflict,

  /// No scan allowance remains.
  quotaExceeded,

  /// The photo cannot be analysed and the user should retake it.
  imageUnusable,

  /// The photo is past its retention window.
  imageExpired,

  /// The analysis provider is unavailable; the request may succeed later.
  analysisUnavailable,

  unknown,
}

/// Backend error codes, from ARCHITECTURE.md section 10. These strings are a contract.
const Map<String, FailureKind> _kindByCode = <String, FailureKind>{
  'VALIDATION_FAILED': FailureKind.server,
  'UNAUTHENTICATED': FailureKind.unauthenticated,
  'FORBIDDEN': FailureKind.forbidden,
  'NOT_FOUND': FailureKind.notFound,
  'RATE_LIMITED': FailureKind.server,
  'INTERNAL': FailureKind.server,
  'IMAGE_UNUSABLE': FailureKind.imageUnusable,
  'IMAGE_EXPIRED': FailureKind.imageExpired,
  'UPLOAD_INVALID': FailureKind.server,
  'QUOTA_EXCEEDED': FailureKind.quotaExceeded,
  'ANALYSIS_UNAVAILABLE': FailureKind.analysisUnavailable,
  'REVISION_CONFLICT': FailureKind.revisionConflict,
  'RESOURCE_DELETED': FailureKind.notFound,
};

class Failure {
  const Failure({required this.kind, this.code, this.debugMessage});

  final FailureKind kind;

  /// Stable machine-readable code from the server, when there was a response.
  final String? code;

  /// Diagnostic text. Never shown to a user: user-facing copy comes from localization.
  final String? debugMessage;

  factory Failure.fromCode(String? code, {String? debugMessage}) {
    return Failure(
      kind: _kindByCode[code] ?? FailureKind.unknown,
      code: code,
      debugMessage: debugMessage,
    );
  }

  const Failure.network({String? debugMessage})
    : this(kind: FailureKind.network, debugMessage: debugMessage);

  const Failure.timeout({String? debugMessage})
    : this(kind: FailureKind.timeout, debugMessage: debugMessage);

  /// Whether offering the user a plain retry is sensible.
  ///
  /// A conflict or an unusable photo needs a different action, not the same request
  /// again, so those are excluded even though they are not fatal.
  bool get isRetryable => switch (kind) {
    FailureKind.network ||
    FailureKind.timeout ||
    FailureKind.server ||
    FailureKind.analysisUnavailable => true,
    _ => false,
  };

  @override
  String toString() => 'Failure(${kind.name}${code == null ? '' : ', $code'})';
}
