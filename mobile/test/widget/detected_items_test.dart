import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/designsystem/app_widgets.dart';
import 'package:scan_my_mandir/core/platform/media_picker.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';
import 'package:scan_my_mandir/features/scan/application/scan_submission_controller.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';
import '../support/fake_media_picker.dart';
import '../support/fake_scan_server.dart';

class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

/// Walks the real flow up to the confirmation screen: Home, capture, gallery, upload, and
/// a server that answers `awaiting_confirmation`.
Future<ScanServer> pumpToDetected(
  WidgetTester tester, {
  required List<Map<String, Object?>> observations,
  int confirmStatus = 201,
}) async {
  final ScanServer server = ScanServer(
    <String>['awaiting_confirmation'],
    observations: observations,
    confirmStatus: confirmStatus,
  );
  final FakeHttpTransport transport = FakeHttpTransport(
    responder: server.respond,
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(transport),
        mediaPickerProvider.overrideWithValue(
          FakeMediaPicker(photo: samplePickedPhoto()),
        ),
        onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
        authServiceProvider.overrideWithValue(FakeAuthService()),
        pollDelayProvider.overrideWithValue((Duration duration) async {}),
        pollPolicyProvider.overrideWithValue(
          const PollPolicy(firstDelay: Duration(milliseconds: 1), maxPolls: 2),
        ),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
  await tester.pumpAndSettle();

  await tester.tap(find.widgetWithText(ActionCard, 'Scan My Mandir'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Choose from gallery'));
  await tester.pumpAndSettle();

  expect(server.observationReads, greaterThan(0));
  return server;
}

void main() {
  testWidgets('shows what the model saw, and lets the user correct it', (
    WidgetTester tester,
  ) async {
    await pumpToDetected(
      tester,
      observations: <Map<String, Object?>>[
        scriptedObservation(
          id: 'obs_001',
          label: 'ganesh',
          category: 'deity_representation',
          representationType: 'statue',
          verificationRequired: true,
        ),
        scriptedObservation(id: 'obs_002', label: 'oil_lamp'),
        scriptedObservation(
          id: 'obs_003',
          label: 'unknown_idol',
          category: 'deity_representation',
          representationType: 'statue',
          confidence: 0.31,
        ),
      ],
    );

    // The catalog labels reach the user in words, not ids, and a cautious "not identified"
    // is shown as exactly that.
    expect(find.text('Ganesh'), findsOneWidget);
    expect(find.text('Oil lamp'), findsOneWidget);
    expect(find.text('Idol, not identified'), findsOneWidget);
    // The object the model flagged is visibly flagged, and confidence is never shown as a
    // probability.
    expect(find.text('Needs your check'), findsOneWidget);
    expect(find.textContaining('0.31'), findsNothing);

    // Correcting an item replaces what it is called, without touching the others.
    await tester.tap(find.byTooltip('Change this item').at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bell'));
    await tester.pumpAndSettle();

    expect(find.text('Bell'), findsOneWidget);
    expect(find.text('Oil lamp'), findsNothing);
    expect(find.text('Ganesh'), findsOneWidget);
  });

  testWidgets('removing every item leaves a list that can be filled again', (
    WidgetTester tester,
  ) async {
    await pumpToDetected(
      tester,
      observations: <Map<String, Object?>>[
        scriptedObservation(id: 'obs_001', label: 'diya'),
      ],
    );

    expect(find.text('Diya'), findsOneWidget);
    await tester.tap(find.byTooltip('Remove').first);
    await tester.pumpAndSettle();

    expect(find.text('No items on the list'), findsOneWidget);

    await tester.tap(find.text('Add item').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Conch'));
    await tester.pumpAndSettle();

    expect(find.text('Conch'), findsOneWidget);
    expect(find.text('No items on the list'), findsNothing);
  });

  testWidgets('submits exactly what the list shows', (
    WidgetTester tester,
  ) async {
    final ScanServer server = await pumpToDetected(
      tester,
      observations: <Map<String, Object?>>[
        scriptedObservation(
          id: 'obs_001',
          label: 'ganesh',
          category: 'deity_representation',
        ),
        scriptedObservation(id: 'obs_002', label: 'diya'),
      ],
    );

    // Correct the second item, then confirm. The dialog lists the catalog for that item's
    // category, so the chosen label is one the server will accept.
    await tester.tap(find.byTooltip('Change this item').at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bell'));
    await tester.pumpAndSettle();

    // Continue to the context questions, answer one, and confirm from there: the objects
    // and the answers are one document.
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('A few questions'), findsOneWidget);

    await tester.tap(find.text('North Indian'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Confirm and continue'));
    await tester.pumpAndSettle();

    expect(server.confirms, 1);
    final List<Object?> objects =
        (server.lastConfirmation?['objects'] as List<Object?>?) ??
        const <Object?>[];
    expect(objects, hasLength(2));

    final Map<String, Object?> corrected = objects
        .cast<Map<String, Object?>>()
        .firstWhere((Map<String, Object?> object) => object['id'] == 'obs_002');
    expect(corrected['label'], 'bell');
    expect(corrected['action'], 'corrected');
    expect(corrected['correctedFrom'], 'diya');
    // The photo revision the user was looking at travels with the confirmation, and so do
    // the answers they gave.
    expect(server.lastConfirmation?['expectedImageRevision'], 1);
    expect(server.lastConfirmation?['context'], <String, Object?>{
      'tradition': 'north_indian',
    });

    // And the screen says what happened rather than leaving the user on a dead form.
    expect(find.text('Confirmed'), findsOneWidget);
    expect(find.textContaining('report is being prepared'), findsOneWidget);
  });

  testWidgets(
    'a confirmation written against an older photo is not lost silently',
    (WidgetTester tester) async {
      final ScanServer server = await pumpToDetected(
        tester,
        observations: <Map<String, Object?>>[
          scriptedObservation(id: 'obs_001', label: 'diya'),
        ],
        confirmStatus: 409,
      );

      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm and continue'));
      await tester.pumpAndSettle();

      expect(server.confirms, 1);
      // The list is reloaded from the server, and the user is told why.
      expect(server.observationReads, greaterThan(1));
      expect(
        find.text('This was changed somewhere else. Reload it and try again.'),
        findsOneWidget,
      );

      // Back on the list, the reloaded items are there rather than the refused edit.
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Diya'), findsOneWidget);
    },
  );

  testWidgets('its icon-only controls carry their purpose', (
    WidgetTester tester,
  ) async {
    await pumpToDetected(
      tester,
      observations: <Map<String, Object?>>[
        scriptedObservation(id: 'obs_001', label: 'diya'),
      ],
    );

    expect(find.byTooltip('Confirm'), findsOneWidget);
    expect(find.byTooltip('Remove'), findsOneWidget);
    expect(find.byTooltip('Change this item'), findsOneWidget);
  });
}
