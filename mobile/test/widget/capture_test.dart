import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/designsystem/app_widgets.dart';
import 'package:scan_my_mandir/core/platform/media_picker.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';
import 'package:scan_my_mandir/features/scan/application/scan_submission_controller.dart';
import 'package:scan_my_mandir/features/scan/presentation/capture_screen.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';
import '../support/fake_media_picker.dart';
import '../support/fake_scan_server.dart';

class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

/// Opens the app on the capture screen with a scripted picker and backend.
Future<FakeHttpTransport> pumpCapture(
  WidgetTester tester, {
  required FakeMediaPicker picker,
  List<String> statuses = const <String>['completed'],
  int maxPolls = 2,
  PollDelay? delay,
}) async {
  final ScanServer server = ScanServer(<String>[...statuses]);
  final FakeHttpTransport transport = FakeHttpTransport(
    responder: server.respond,
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(transport),
        mediaPickerProvider.overrideWithValue(picker),
        onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
        // A scan starts a guest session on demand; tests must not reach Supabase.
        authServiceProvider.overrideWithValue(FakeAuthService()),
        // No real waiting in tests.
        pollDelayProvider.overrideWithValue(
          delay ?? (Duration duration) async {},
        ),
        pollPolicyProvider.overrideWithValue(
          PollPolicy(
            firstDelay: const Duration(milliseconds: 1),
            maxPolls: maxPolls,
          ),
        ),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
  await tester.pumpAndSettle();

  await tester.tap(find.widgetWithText(ActionCard, 'Scan My Mandir'));
  await tester.pumpAndSettle();

  return transport;
}

void main() {
  testWidgets('backing out of the picker starts nothing', (
    WidgetTester tester,
  ) async {
    // A null result is the user cancelling, which is not a failure.
    final FakeHttpTransport transport = await pumpCapture(
      tester,
      picker: FakeMediaPicker(photo: null),
    );

    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();

    expect(find.byType(CaptureScreen), findsOneWidget);
    expect(
      transport.calls.where((RecordedCall call) => call.path == '/v1/scans'),
      isEmpty,
    );
  });

  testWidgets('a refused camera says so and leaves the gallery available', (
    WidgetTester tester,
  ) async {
    final FakeMediaPicker picker = FakeMediaPicker(
      photo: samplePickedPhoto(),
      cameraFailure: const MediaPickerException(PickFailureKind.permissionDenied),
    );
    final FakeHttpTransport transport = await pumpCapture(
      tester,
      picker: picker,
    );

    await tester.tap(find.text('Take a photo'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Camera access was refused. You can still choose a photo from your gallery.',
      ),
      findsOneWidget,
    );
    expect(picker.cameraCalls, 1);
    // Nothing was uploaded by a refused camera.
    expect(
      transport.calls.where((RecordedCall call) => call.path == '/v1/scans'),
      isEmpty,
    );

    // The fallback is the point: the gallery still works, and a finished analysis hands
    // over to the confirmation screen rather than stopping at a stage list.
    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();

    expect(picker.galleryCalls, 1);
    expect(find.text('Detected items'), findsOneWidget);
  });

  testWidgets('a picked photo is uploaded and the stages are shown', (
    WidgetTester tester,
  ) async {
    // The analysis is still running, so the screen stays and shows the server's stages.
    // The delay never completes, which parks the poll loop mid-wait: that is what an
    // in-flight analysis looks like, without the test having to race a timer.
    final FakeHttpTransport transport = await pumpCapture(
      tester,
      picker: FakeMediaPicker(photo: samplePickedPhoto()),
      statuses: <String>['analyzing'],
      delay: (Duration duration) => Completer<void>().future,
    );

    await tester.tap(find.text('Choose from gallery'));
    // pumpAndSettle cannot be used here: an in-flight analysis shows an animating progress
    // bar, so no frame ever settles. A few pumps are enough for the submission's futures
    // and for the navigation.
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Uploading your photo'), findsOneWidget);
    expect(find.text('Identifying visible objects'), findsOneWidget);
    expect(find.text('Ready for your review'), findsOneWidget);

    final List<String> paths = <String>[
      for (final RecordedCall call in transport.calls) call.path,
    ];
    expect(paths, contains('/v1/scans'));
    expect(paths, contains('/v1/scans/$testScanId/upload-complete'));
    expect(
      transport.calls.any((RecordedCall call) => call.method == 'PUT'),
      isTrue,
      reason: 'the photo goes straight to the signed url',
    );
  });

  testWidgets('an unusable photo ends with the retake action', (
    WidgetTester tester,
  ) async {
    await pumpCapture(
      tester,
      picker: FakeMediaPicker(photo: samplePickedPhoto()),
      statuses: <String>['needs_retake'],
    );

    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();

    // A retake is the user's move, so no retry is offered — the way out is another photo.
    expect(
      find.text('This photo cannot be analysed. Take a new photo.'),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsNothing);

    await tester.tap(find.text('Choose a photo'));
    await tester.pumpAndSettle();

    expect(find.byType(CaptureScreen), findsOneWidget);
  });

  testWidgets('a scan that never finishes stops asking and offers a retry', (
    WidgetTester tester,
  ) async {
    final FakeHttpTransport transport = await pumpCapture(
      tester,
      picker: FakeMediaPicker(photo: samplePickedPhoto()),
      statuses: <String>['analyzing'],
      maxPolls: 2,
    );
    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();

    // Polling is bounded: it stops rather than asking forever.
    final int polls = transport.calls
        .where((RecordedCall call) => call.method == 'GET')
        .length;
    expect(polls, 2);
    expect(find.text('Retry'), findsOneWidget);

    // And the retry asks again, still bounded.
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(
      transport.calls
          .where((RecordedCall call) => call.method == 'GET')
          .length,
      greaterThan(polls),
    );
  });
}
