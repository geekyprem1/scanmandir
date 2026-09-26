import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/model/failure.dart';
import 'package:scan_my_mandir/core/model/ui_state.dart';
import 'package:scan_my_mandir/core/network/http_transport.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/scan/application/scan_submission_controller.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';

const String scanId = '11111111-2222-3333-4444-555555555555';
final Uint8List photo = Uint8List.fromList(<int>[137, 80, 78, 71]);

HttpOutcome answer(int status, Map<String, Object?> body) =>
    HttpOutcome(statusCode: status, body: jsonEncode(body));

Map<String, Object?> scanBody(String status, {String? failedStage}) =>
    <String, Object?>{
      'id': scanId,
      'status': status,
      'imageRevision': 1,
      'inputRevision': 0,
      'failedStage': failedStage,
      'nextAction': 'wait',
    };

/// The four answers a scan submission needs, plus the polling loop.
///
/// [statuses] is consumed one per status read; the last entry repeats, so a test states
/// only the transition it cares about.
class ScanServer {
  ScanServer(this.statuses, {this.createStatus = 201, this.createBody});

  final List<String> statuses;
  final int createStatus;
  final Map<String, Object?>? createBody;

  int creates = 0;
  int uploadUrls = 0;
  int uploads = 0;
  int completes = 0;
  int reads = 0;

  Future<HttpOutcome?> respond(RecordedCall call) async {
    if (call.method == 'POST' && call.path == '/v1/scans') {
      creates++;
      return answer(
        createStatus,
        createBody ??
            (createStatus == 201
                ? scanBody('awaiting_upload')
                : <String, Object?>{
                    'error': <String, Object?>{'code': 'QUOTA_EXCEEDED'},
                  }),
      );
    }
    if (call.method == 'POST' && call.path.endsWith('/upload-url')) {
      uploadUrls++;
      return answer(200, <String, Object?>{
        'uploadUrl': 'http://127.0.0.1:3000/v1/dev-storage?key=staging%2Fone',
        'stagingKey': 'scans/u/$scanId/r1/staging/one',
        'requiredHeaders': <String, Object?>{'content-type': 'image/jpeg'},
      });
    }
    if (call.method == 'PUT') {
      uploads++;
      return const HttpOutcome(statusCode: 204, body: '');
    }
    if (call.method == 'POST' && call.path.endsWith('/upload-complete')) {
      completes++;
      // Completion always leaves the scan queued: what happens next is the worker's
      // business, which is what the polls observe.
      return answer(200, scanBody('queued'));
    }
    if (call.method == 'GET' && call.path.startsWith('/v1/scans/')) {
      reads++;
      final int index = (reads - 1).clamp(0, statuses.length - 1);
      return answer(200, scanBody(statuses[index]));
    }
    return null;
  }
}

void main() {
  ProviderContainer containerFor(
    FakeHttpTransport transport, {
    List<Duration>? delays,
    PollPolicy? policy,
    FakeAuthService? auth,
    Future<HttpOutcome?> Function(RecordedCall call)? responder,
  }) {
    final ProviderContainer container = ProviderContainer(
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(transport),
        authServiceProvider.overrideWithValue(auth ?? FakeAuthService()),
        pollDelayProvider.overrideWithValue((Duration duration) async {
          delays?.add(duration);
        }),
        pollPolicyProvider.overrideWithValue(
          policy ??
              const PollPolicy(
                firstDelay: Duration(milliseconds: 100),
                factor: 1.5,
                maxDelay: Duration(milliseconds: 400),
                maxPolls: 10,
              ),
        ),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('runs create, upload, complete and polling in order', () async {
    final ScanServer server = ScanServer(<String>[
      'analyzing',
      'analyzing',
      'completed',
    ]);
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: server.respond,
    );
    final ProviderContainer container = containerFor(transport);

    final List<ScanStage> stages = <ScanStage>[];
    container.listen<UiState<ScanSubmission>>(
      scanSubmissionControllerProvider,
      (_, UiState<ScanSubmission> next) {
        final ScanSubmission? submission = next.valueOrNull;
        if (submission != null) stages.add(submission.stage);
      },
      fireImmediately: true,
    );

    await container
        .read(scanSubmissionControllerProvider.notifier)
        .submit(photo: photo);

    final UiState<ScanSubmission> state = container.read(
      scanSubmissionControllerProvider,
    );
    expect(state, isA<UiContent<ScanSubmission>>());
    expect(state.valueOrNull?.stage, ScanStage.readyForConfirmation);
    expect(state.valueOrNull?.scanId, scanId);

    // The upload happened exactly once, and polling continued until the server stopped
    // moving the scan.
    expect(server.creates, 1);
    expect(server.uploadUrls, 1);
    expect(server.uploads, 1);
    expect(server.completes, 1);
    expect(server.reads, 3);

    expect(stages.first, ScanStage.uploading);
    expect(stages, contains(ScanStage.analyzing));
    expect(stages.last, ScanStage.readyForConfirmation);

    expect(
      transport.calls.map((RecordedCall call) => call.method).toList(),
      <String>['POST', 'POST', 'PUT', 'POST', 'GET', 'GET', 'GET'],
    );
    expect(
      transport.calls.where((RecordedCall call) => call.method != 'PUT'),
      everyElement(
        isA<RecordedCall>().having(
          (RecordedCall call) => call.headers['authorization'],
          'authorization',
          'Bearer test-access-token',
        ),
      ),
    );
  });

  test(
    'waits longer between polls and stops at the configured number',
    () async {
      final ScanServer server = ScanServer(<String>['analyzing']);
      final List<Duration> delays = <Duration>[];
      final ProviderContainer container = containerFor(
        FakeHttpTransport(responder: server.respond),
        delays: delays,
        policy: const PollPolicy(
          firstDelay: Duration(milliseconds: 100),
          factor: 2,
          maxDelay: Duration(milliseconds: 400),
          maxPolls: 5,
        ),
      );

      await container
          .read(scanSubmissionControllerProvider.notifier)
          .submit(photo: photo);

      expect(delays, <Duration>[
        const Duration(milliseconds: 100),
        const Duration(milliseconds: 200),
        const Duration(milliseconds: 400),
        const Duration(milliseconds: 400),
        const Duration(milliseconds: 400),
      ]);
      expect(server.reads, 5);

      final UiState<ScanSubmission> state = container.read(
        scanSubmissionControllerProvider,
      );
      expect(state, isA<UiRecoverableError<ScanSubmission>>());
      expect(state.failureOrNull?.code, 'POLL_TIMEOUT');
    },
  );

  test('resuming after a poll timeout does not upload the photo again', () async {
    final ScanServer server = ScanServer(<String>['analyzing']);
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: server.respond,
    );
    final ProviderContainer container = containerFor(
      transport,
      policy: const PollPolicy(
        firstDelay: Duration(milliseconds: 10),
        maxPolls: 2,
      ),
    );
    final ScanSubmissionController controller = container.read(
      scanSubmissionControllerProvider.notifier,
    );

    await controller.submit(photo: photo);
    expect(
      container.read(scanSubmissionControllerProvider).failureOrNull?.code,
      'POLL_TIMEOUT',
    );

    // The server finishes while the user is looking at the retry.
    server.statuses[0] = 'completed';
    await controller.retry();

    expect(
      container.read(scanSubmissionControllerProvider),
      isA<UiContent<ScanSubmission>>(),
    );
    // One creation and one upload for the whole submission: the retry only resumed
    // polling (TASKS P4-07).
    expect(server.creates, 1);
    expect(server.uploads, 1);
    expect(server.completes, 1);
  });

  test('turns a retake request into a terminal, actionable failure', () async {
    final ScanServer server = ScanServer(<String>['needs_retake']);
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: server.respond,
    );
    final ProviderContainer container = containerFor(transport);

    await container
        .read(scanSubmissionControllerProvider.notifier)
        .submit(photo: photo);

    final UiState<ScanSubmission> state = container.read(
      scanSubmissionControllerProvider,
    );
    expect(state, isA<UiTerminalError<ScanSubmission>>());
    expect(state.failureOrNull?.kind, FailureKind.imageUnusable);
    // A retake is the user's move, so polling stopped.
    expect(server.reads, 1);
  });

  test('a refused allowance stops before any upload', () async {
    final ScanServer server = ScanServer(<String>['queued'], createStatus: 402);
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: server.respond,
    );
    final ProviderContainer container = containerFor(transport);

    await container
        .read(scanSubmissionControllerProvider.notifier)
        .submit(photo: photo);

    final UiState<ScanSubmission> state = container.read(
      scanSubmissionControllerProvider,
    );
    expect(state, isA<UiTerminalError<ScanSubmission>>());
    expect(state.failureOrNull?.kind, FailureKind.quotaExceeded);
    expect(server.uploadUrls, 0);
    expect(server.uploads, 0);
  });

  test(
    'a failed poll stays recoverable and resumes where it stopped',
    () async {
      bool failNextRead = false;
      final ScanServer server = ScanServer(<String>['analyzing', 'completed']);
      final FakeHttpTransport transport = FakeHttpTransport(
        responder: (RecordedCall call) async {
          if (failNextRead && call.method == 'GET') {
            failNextRead = false;
            throw const TransportException(Failure.network());
          }
          return server.respond(call);
        },
      );
      final ProviderContainer container = containerFor(
        transport,
        policy: const PollPolicy(
          firstDelay: Duration(milliseconds: 10),
          maxPolls: 5,
        ),
      );
      final ScanSubmissionController controller = container.read(
        scanSubmissionControllerProvider.notifier,
      );

      failNextRead = true;
      await controller.submit(photo: photo);

      final UiState<ScanSubmission> state = container.read(
        scanSubmissionControllerProvider,
      );
      expect(state, isA<UiRecoverableError<ScanSubmission>>());
      expect(state.failureOrNull?.kind, FailureKind.network);

      await controller.retry();

      expect(
        container.read(scanSubmissionControllerProvider),
        isA<UiContent<ScanSubmission>>(),
      );
      expect(server.creates, 1);
      expect(server.uploads, 1);
    },
  );

  test(
    'a retry before the upload landed reuses the same idempotency key',
    () async {
      // The first attempt fails at the upload step; the retry must replay the same creation
      // rather than reserving a second scan.
      int uploads = 0;
      final ScanServer server = ScanServer(<String>['queued', 'completed']);
      final FakeHttpTransport transport = FakeHttpTransport(
        responder: (RecordedCall call) async {
          if (call.method == 'PUT') {
            uploads++;
            if (uploads == 1) {
              throw const TransportException(
                Failure(kind: FailureKind.network, debugMessage: 'dropped'),
              );
            }
          }
          return server.respond(call);
        },
      );
      final ProviderContainer container = containerFor(transport);
      final ScanSubmissionController controller = container.read(
        scanSubmissionControllerProvider.notifier,
      );

      await controller.submit(photo: photo);
      expect(
        container.read(scanSubmissionControllerProvider).failureOrNull?.kind,
        FailureKind.network,
      );

      await controller.retry();

      expect(
        container.read(scanSubmissionControllerProvider),
        isA<UiContent<ScanSubmission>>(),
      );
      final List<String> keys = <String>[
        for (final RecordedCall call in transport.calls)
          if (call.method == 'POST' && call.path == '/v1/scans')
            '${call.jsonBody['idempotencyKey']}',
      ];
      expect(keys.length, 2);
      expect(keys.first, keys.last);
      expect(uploads, 2);
    },
  );

  test('poll delays grow and are capped', () {
    const PollPolicy policy = PollPolicy(
      firstDelay: Duration(seconds: 2),
      factor: 1.5,
      maxDelay: Duration(seconds: 10),
      maxPolls: 40,
    );

    expect(policy.delayFor(0), const Duration(seconds: 2));
    expect(policy.delayFor(1), const Duration(seconds: 3));
    expect(policy.delayFor(2), const Duration(milliseconds: 4500));
    expect(policy.delayFor(20), const Duration(seconds: 10));
  });
}
