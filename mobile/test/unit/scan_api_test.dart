import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/model/failure.dart';
import 'package:scan_my_mandir/core/network/http_transport.dart';
import 'package:scan_my_mandir/features/scan/data/scan_api.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';

const String scanId = '11111111-2222-3333-4444-555555555555';

HttpOutcome answer(int status, Map<String, Object?> body) =>
    HttpOutcome(statusCode: status, body: jsonEncode(body));

Map<String, Object?> scanBody(String status, {String? failedStage}) {
  return <String, Object?>{
    'id': scanId,
    'status': status,
    'imageRevision': 1,
    'inputRevision': 0,
    'failedStage': failedStage,
    'nextAction': 'wait',
  };
}

void main() {
  ScanApi apiWith(FakeHttpTransport transport, {FakeAuthService? auth}) {
    return ScanApi(
      environment: testEnvironment(),
      transport: transport,
      auth: auth ?? FakeAuthService(),
    );
  }

  test(
    'creates a scan with the idempotency key and the session token',
    () async {
      final FakeHttpTransport transport = FakeHttpTransport(
        responder: (RecordedCall call) async =>
            answer(201, scanBody('awaiting_upload')),
      );

      final ScanSnapshot snapshot = await apiWith(
        transport,
      ).create(idempotencyKey: 'key-1');

      final RecordedCall call = transport.calls.single;
      expect(call.method, 'POST');
      expect(call.path, '/v1/scans');
      expect(call.jsonBody['idempotencyKey'], 'key-1');
      expect(call.headers['authorization'], 'Bearer test-access-token');
      expect(snapshot.id, scanId);
      expect(snapshot.status, ScanStatus.awaitingUpload);
    },
  );

  test('reads an upload ticket the way the server describes it', () async {
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: (RecordedCall call) async => answer(200, <String, Object?>{
        'uploadUrl': 'http://127.0.0.1:3000/v1/dev-storage?key=staging%2Fone',
        'stagingKey': 'scans/u/$scanId/r1/staging/one',
        'requiredHeaders': <String, Object?>{'content-type': 'image/jpeg'},
      }),
    );

    final UploadTicket ticket = await apiWith(
      transport,
    ).requestUploadUrl(scanId: scanId, contentType: 'image/jpeg');

    expect(ticket.uploadUrl.path, '/v1/dev-storage');
    expect(ticket.stagingKey, 'scans/u/$scanId/r1/staging/one');
    expect(ticket.requiredHeaders, <String, String>{
      'content-type': 'image/jpeg',
    });
    expect(transport.calls.single.jsonBody['contentType'], 'image/jpeg');
  });

  test('uploads the photo to the signed url without the session token', () async {
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: (RecordedCall call) async =>
          const HttpOutcome(statusCode: 204, body: ''),
    );

    await apiWith(transport).uploadOriginal(
      uploadUrl: Uri.parse('https://signed.example/put/one?token=abc'),
      bytes: Uint8List.fromList(<int>[1, 2, 3]),
      headers: <String, String>{'content-type': 'image/jpeg'},
    );

    final RecordedCall call = transport.calls.single;
    expect(call.method, 'PUT');
    expect(call.uri.host, 'signed.example');
    expect(call.body, <int>[1, 2, 3]);
    expect(call.headers['content-type'], 'image/jpeg');
    // The ticket is the authorization for this object; the session must not be sent to
    // a third-party host.
    expect(call.headers.containsKey('authorization'), isFalse);
  });

  test(
    'treats a refused upload as retryable, because a fresh ticket fixes it',
    () async {
      final FakeHttpTransport transport = FakeHttpTransport(
        responder: (RecordedCall call) async =>
            const HttpOutcome(statusCode: 403, body: 'expired'),
      );

      await expectLater(
        apiWith(transport).uploadOriginal(
          uploadUrl: Uri.parse('https://signed.example/put/one'),
          bytes: Uint8List.fromList(<int>[1]),
          headers: const <String, String>{},
        ),
        throwsA(
          isA<TransportException>().having(
            (TransportException error) => error.failure.isRetryable,
            'isRetryable',
            isTrue,
          ),
        ),
      );
    },
  );

  test('refreshes the session once when the token is rejected', () async {
    int attempts = 0;
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: (RecordedCall call) async {
        attempts++;
        return attempts == 1
            ? answer(401, <String, Object?>{
                'error': <String, Object?>{'code': 'UNAUTHENTICATED'},
              })
            : answer(200, scanBody('queued'));
      },
    );
    final FakeAuthService auth = FakeAuthService(
      refreshedToken: 'refreshed-token',
    );

    final ScanSnapshot snapshot = await apiWith(
      transport,
      auth: auth,
    ).read(scanId: scanId);

    expect(snapshot.status, ScanStatus.queued);
    expect(auth.refreshes, 1);
    expect(transport.calls.length, 2);
    expect(
      transport.calls.first.headers['authorization'],
      'Bearer test-access-token',
    );
    expect(
      transport.calls.last.headers['authorization'],
      'Bearer refreshed-token',
    );
  });

  test(
    'surfaces a still-rejected token as unauthenticated rather than retrying forever',
    () async {
      final FakeHttpTransport transport = FakeHttpTransport(
        responder: (RecordedCall call) async => answer(401, <String, Object?>{
          'error': <String, Object?>{'code': 'UNAUTHENTICATED'},
        }),
      );

      await expectLater(
        apiWith(
          transport,
          auth: FakeAuthService(refreshedToken: null),
        ).read(scanId: scanId),
        throwsA(
          isA<TransportException>().having(
            (TransportException error) => error.failure.kind,
            'kind',
            FailureKind.unauthenticated,
          ),
        ),
      );
      expect(transport.calls.length, 1);
    },
  );

  test('refuses to call the backend at all when there is no session', () async {
    final FakeHttpTransport transport = FakeHttpTransport();

    await expectLater(
      apiWith(
        transport,
        auth: FakeAuthService(token: null),
      ).read(scanId: scanId),
      throwsA(isA<TransportException>()),
    );
    expect(transport.calls, isEmpty);
  });

  test('maps the server allowance refusal onto the quota failure', () async {
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: (RecordedCall call) async => answer(402, <String, Object?>{
        'error': <String, Object?>{
          'code': 'QUOTA_EXCEEDED',
          'message': 'No scans left this month.',
        },
      }),
    );

    await expectLater(
      apiWith(transport).create(idempotencyKey: 'key-1'),
      throwsA(
        isA<TransportException>().having(
          (TransportException error) => error.failure.kind,
          'kind',
          FailureKind.quotaExceeded,
        ),
      ),
    );
  });

  test('keeps polling a state this build has never heard of', () async {
    // A server that learns a new state must not make a shipped app treat a scan as
    // finished.
    final ScanSnapshot snapshot = ScanSnapshot.fromJson(
      scanBody('some_future_state'),
    );

    expect(snapshot.status, ScanStatus.unknown);
    expect(snapshot.status.isTerminal, isFalse);
  });

  test(
    'keeps the failure detail the server sent, for diagnosis only',
    () async {
      final FakeHttpTransport transport = FakeHttpTransport(
        responder: (RecordedCall call) async => answer(400, <String, Object?>{
          'error': <String, Object?>{
            'code': 'UPLOAD_INVALID',
            'message': 'The upload is not usable.',
          },
        }),
      );

      await expectLater(
        apiWith(transport).completeUpload(
          scanId: scanId,
          stagingKey: 'scans/u/$scanId/r1/staging/one',
        ),
        throwsA(
          isA<TransportException>().having(
            (TransportException error) => error.failure.code,
            'code',
            'UPLOAD_INVALID',
          ),
        ),
      );
    },
  );
}
