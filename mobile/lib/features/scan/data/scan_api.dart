import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_service.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/environment.dart';
import '../../../core/model/failure.dart';
import '../../../core/network/error_mapping.dart';
import '../../../core/network/http_transport.dart';
import '../../../core/providers.dart';

/// Scan lifecycle states, as the server reports them (ARCHITECTURE.md section 6).
///
/// [unknown] exists so a server that learns a new state cannot crash a shipped app; the
/// scan simply keeps being polled rather than being mistaken for finished.
enum ScanStatus {
  awaitingUpload('awaiting_upload'),
  queued('queued'),
  analyzing('analyzing'),
  needsRetake('needs_retake'),
  awaitingConfirmation('awaiting_confirmation'),
  generatingReport('generating_report'),
  completed('completed'),
  failed('failed'),
  deleted('deleted'),
  unknown('unknown');

  const ScanStatus(this.wire);

  final String wire;

  static ScanStatus fromWire(Object? value) {
    for (final ScanStatus status in values) {
      if (status.wire == value) return status;
    }
    return unknown;
  }

  /// The server will not move this scan further on its own.
  ///
  /// `awaiting_confirmation` counts as terminal for polling: the next move belongs to the
  /// user, not to the worker.
  bool get isTerminal => switch (this) {
    needsRetake ||
    awaitingConfirmation ||
    completed ||
    failed ||
    deleted => true,
    _ => false,
  };
}

/// One scan as the server describes it.
class ScanSnapshot {
  const ScanSnapshot({
    required this.id,
    required this.status,
    required this.imageRevision,
    required this.inputRevision,
    this.failedStage,
    this.nextAction,
  });

  final String id;
  final ScanStatus status;
  final int imageRevision;
  final int inputRevision;

  /// Which stage exhausted its retries, when the scan failed.
  final String? failedStage;

  /// What the server wants the client to do next; null for a tombstoned scan.
  final String? nextAction;

  static ScanSnapshot fromJson(Map<String, Object?> json) {
    return ScanSnapshot(
      id: '${json['id']}',
      status: ScanStatus.fromWire(json['status']),
      imageRevision: (json['imageRevision'] as num?)?.toInt() ?? 0,
      inputRevision: (json['inputRevision'] as num?)?.toInt() ?? 0,
      failedStage: json['failedStage'] as String?,
      nextAction: json['nextAction'] as String?,
    );
  }
}

/// Where to upload one attempt, and what the signed URL requires.
class UploadTicket {
  const UploadTicket({
    required this.uploadUrl,
    required this.stagingKey,
    required this.requiredHeaders,
  });

  final Uri uploadUrl;
  final String stagingKey;

  /// Signed uploads carry their own constraints, so the client sends what it is told to
  /// send rather than deciding for itself.
  final Map<String, String> requiredHeaders;
}

/// The scan endpoints of the backend (ARCHITECTURE.md section 10).
///
/// Authorization is the session's bearer token, fetched per call and refreshed once on a
/// 401 — a token can expire between two polls, and that should not surface to the user as
/// a failure.
class ScanApi {
  ScanApi({
    required this._environment,
    required this._transport,
    required this._auth,
  });

  final Environment _environment;
  final HttpTransport _transport;
  final AuthService _auth;

  Uri _resolve(String path) => _environment.apiBaseUrl.resolve(path);

  Future<ScanSnapshot> create({required String idempotencyKey}) async {
    final HttpOutcome outcome = await _authorized(
      (String token) => _transport.post(
        _resolve('/v1/scans'),
        headers: _headers(token),
        jsonBody: <String, Object?>{'idempotencyKey': idempotencyKey},
      ),
    );
    return _snapshot(outcome);
  }

  Future<UploadTicket> requestUploadUrl({
    required String scanId,
    required String contentType,
  }) async {
    final HttpOutcome outcome = await _authorized(
      (String token) => _transport.post(
        _resolve('/v1/scans/$scanId/upload-url'),
        headers: _headers(token),
        jsonBody: <String, Object?>{'contentType': contentType},
      ),
    );
    final Map<String, Object?> body = _requireBody(outcome);
    return UploadTicket(
      uploadUrl: Uri.parse('${body['uploadUrl']}'),
      stagingKey: '${body['stagingKey']}',
      requiredHeaders: _stringMap(body['requiredHeaders']),
    );
  }

  /// Uploads straight to the signed URL. Deliberately not authorized with the session:
  /// the ticket is the authorization, and it is scoped to one object.
  Future<void> uploadOriginal({
    required Uri uploadUrl,
    required Uint8List bytes,
    required Map<String, String> headers,
  }) async {
    final HttpOutcome outcome = await _transport.putBytes(
      uploadUrl,
      bytes: bytes,
      headers: headers,
    );
    if (!outcome.isSuccess) {
      // A signed URL can expire or be refused. The client cannot tell those apart, and
      // the fix for both is the same: ask for a fresh ticket. So this stays retryable.
      throw TransportException(
        Failure(
          kind: FailureKind.server,
          code: 'UPLOAD_FAILED',
          debugMessage: 'HTTP ${outcome.statusCode}',
        ),
      );
    }
  }

  Future<ScanSnapshot> completeUpload({
    required String scanId,
    required String stagingKey,
  }) async {
    final HttpOutcome outcome = await _authorized(
      (String token) => _transport.post(
        _resolve('/v1/scans/$scanId/upload-complete'),
        headers: _headers(token),
        jsonBody: <String, Object?>{'stagingKey': stagingKey},
      ),
    );
    return _snapshot(outcome);
  }

  Future<ScanSnapshot> read({required String scanId}) async {
    final HttpOutcome outcome = await _authorized(
      (String token) => _transport.get(
        _resolve('/v1/scans/$scanId'),
        headers: _headers(token),
      ),
    );
    return _snapshot(outcome);
  }

  Map<String, String> _headers(String token) => <String, String>{
    'authorization': 'Bearer $token',
  };

  /// Runs an authenticated call, refreshing the session once when the server rejects the
  /// token, and turns a non-success into a [TransportException].
  Future<HttpOutcome> _authorized(
    Future<HttpOutcome> Function(String token) send,
  ) async {
    final String? token = await _auth.accessToken();
    if (token == null) {
      throw const TransportException(
        Failure(kind: FailureKind.unauthenticated, code: 'UNAUTHENTICATED'),
      );
    }

    HttpOutcome outcome = await send(token);
    if (outcome.statusCode == 401) {
      final String? refreshed = await _auth.refreshedAccessToken();
      if (refreshed != null) {
        outcome = await send(refreshed);
      }
    }

    if (!outcome.isSuccess) {
      throw TransportException(failureFromOutcome(outcome));
    }
    return outcome;
  }

  ScanSnapshot _snapshot(HttpOutcome outcome) {
    return ScanSnapshot.fromJson(_requireBody(outcome));
  }

  Map<String, Object?> _requireBody(HttpOutcome outcome) {
    final Map<String, Object?>? body = outcome.jsonObject;
    if (body == null) {
      throw TransportException(
        Failure(
          kind: FailureKind.server,
          code: 'MALFORMED_RESPONSE',
          debugMessage: 'HTTP ${outcome.statusCode}',
        ),
      );
    }
    return body;
  }

  Map<String, String> _stringMap(Object? value) {
    if (value is! Map<String, Object?>) return const <String, String>{};
    return value.map(
      (String key, Object? header) => MapEntry<String, String>(key, '$header'),
    );
  }
}

final Provider<ScanApi> scanApiProvider = Provider<ScanApi>((Ref ref) {
  return ScanApi(
    environment: ref.watch(environmentProvider),
    transport: ref.watch(httpTransportProvider),
    auth: ref.watch(authServiceProvider),
  );
});
