import 'dart:convert';
import 'dart:typed_data';

import 'package:scan_my_mandir/core/network/http_transport.dart';

import 'fake_http_transport.dart';

/// The scan id every scripted answer uses.
const String testScanId = '11111111-2222-3333-4444-555555555555';

Uint8List testPhotoBytes() =>
    Uint8List.fromList(<int>[137, 80, 78, 71, 13, 10, 26, 10]);

HttpOutcome scriptedAnswer(int status, Map<String, Object?> body) =>
    HttpOutcome(statusCode: status, body: jsonEncode(body));

Map<String, Object?> scriptedScanBody(String status, {String? failedStage}) =>
    <String, Object?>{
      'id': testScanId,
      'status': status,
      'imageRevision': 1,
      'inputRevision': 0,
      'failedStage': failedStage,
      'retakeReasons': <String>[],
      'nextAction': 'wait',
    };

/// One object as the observations endpoint reports it.
Map<String, Object?> scriptedObservation({
  String id = 'obs_001',
  String label = 'diya',
  String category = 'puja_object',
  String representationType = 'physical_object',
  bool verificationRequired = false,
  double? confidence = 0.9,
  bool located = true,
}) => <String, Object?>{
  'id': id,
  'category': category,
  'label': label,
  'representationType': representationType,
  'groupId': null,
  'memberLabels': null,
  'boundingBox': located
      ? <String, Object?>{'x': 0.1, 'y': 0.2, 'width': 0.3, 'height': 0.3}
      : null,
  'modelConfidence': confidence,
  'verificationRequired': verificationRequired,
};

Map<String, Object?> scriptedObservationsBody({
  List<Map<String, Object?>> observations = const <Map<String, Object?>>[],
  bool analysed = true,
}) => <String, Object?>{
  'scanId': testScanId,
  'imageRevision': 1,
  'inputRevision': 0,
  'analysed': analysed,
  'run': <String, Object?>{
    'id': 'run-1',
    'model': 'scripted-vision',
    'provider': 'test',
    'promptVersion': '2',
    'schemaVersion': '1',
    'latencyMs': 1200,
    'attempts': 1,
    'imageUsable': true,
    'looksLikeHomeMandir': true,
    'qualityReasons': <String>[],
    'analysedAt': '2026-09-26T10:00:00.000Z',
  },
  'observations': observations,
  'findings': <Object?>[],
};

/// A scripted backend for the scan endpoints: creation, upload, status, observations and
/// confirmation.
///
/// [statuses] is consumed one per status read, and the last entry repeats, so a test
/// states only the transition it cares about. Completion always answers `queued`: what
/// happens next belongs to the worker, and that is what the polls observe.
class ScanServer {
  ScanServer(
    this.statuses, {
    this.createStatus = 201,
    List<Map<String, Object?>>? observations,
    this.confirmStatus = 201,
  }) : observations = observations ?? const <Map<String, Object?>>[];

  final List<String> statuses;
  final int createStatus;

  /// What the observations endpoint reports. Settable per test.
  List<Map<String, Object?>> observations;
  final int confirmStatus;

  int creates = 0;
  int uploadUrls = 0;
  int uploads = 0;
  int completes = 0;
  int reads = 0;
  int observationReads = 0;
  int confirms = 0;
  Map<String, Object?>? lastConfirmation;

  Future<HttpOutcome?> respond(RecordedCall call) async {
    if (call.method == 'POST' && call.path == '/v1/scans') {
      creates++;
      return scriptedAnswer(
        createStatus,
        createStatus == 201
            ? scriptedScanBody('awaiting_upload')
            : <String, Object?>{
                'error': <String, Object?>{'code': 'QUOTA_EXCEEDED'},
              },
      );
    }
    if (call.method == 'POST' && call.path.endsWith('/upload-url')) {
      uploadUrls++;
      return scriptedAnswer(200, <String, Object?>{
        'uploadUrl': 'http://127.0.0.1:3000/v1/dev-storage?key=staging%2Fone',
        'stagingKey': 'scans/u/$testScanId/r1/staging/one',
        'requiredHeaders': <String, Object?>{'content-type': 'image/jpeg'},
      });
    }
    if (call.method == 'PUT') {
      uploads++;
      return const HttpOutcome(statusCode: 204, body: '');
    }
    if (call.method == 'POST' && call.path.endsWith('/upload-complete')) {
      completes++;
      return scriptedAnswer(200, scriptedScanBody('queued'));
    }
    if (call.method == 'GET' && call.path.endsWith('/observations')) {
      observationReads++;
      return scriptedAnswer(
        200,
        scriptedObservationsBody(observations: observations, analysed: observations.isNotEmpty),
      );
    }
    if (call.method == 'POST' && call.path.endsWith('/confirmation')) {
      confirms++;
      lastConfirmation = call.jsonBody;
      if (confirmStatus == 201) {
        return scriptedAnswer(201, <String, Object?>{
          'scanId': testScanId,
          'imageRevision': 1,
          'inputRevision': 1,
          'status': 'generating_report',
        });
      }
      return scriptedAnswer(confirmStatus, <String, Object?>{
        'error': <String, Object?>{'code': 'REVISION_CONFLICT'},
      });
    }
    if (call.method == 'GET' && call.path.startsWith('/v1/scans/')) {
      reads++;
      final int index = (reads - 1).clamp(0, statuses.length - 1);
      return scriptedAnswer(200, scriptedScanBody(statuses[index]));
    }
    return null;
  }
}
