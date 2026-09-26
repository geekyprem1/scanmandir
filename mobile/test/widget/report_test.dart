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

/// Runs a completed scan through the real app up to the report: capture, upload, the
/// analysis finishing, and a server that answers with a report.
Future<ScanServer> pumpToReport(
  WidgetTester tester, {
  required Map<String, Object?> report,
  double textScale = 1,
}) async {
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  final ScanServer server = ScanServer(
    <String>['completed'],
    observations: <Map<String, Object?>>[
      scriptedObservation(id: 'obs_001', label: 'ganesh'),
    ],
    report: report,
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

  return server;
}

Map<String, Object?> scriptedReport({
  bool available = true,
  List<Map<String, Object?>> items = const <Map<String, Object?>>[],
  List<Map<String, Object?>> findings = const <Map<String, Object?>>[],
}) => <String, Object?>{
  'scanId': testScanId,
  'available': available,
  'status': available ? 'completed' : 'generating_report',
  'reportId': 'report-1',
  'inputRevision': 1,
  'generatedAt': '2026-09-26T10:00:00.000Z',
  'report': available
      ? <String, Object?>{
          'reportVersion': '1',
          'inputRevision': 1,
          'summary': <String, Object?>{
            'items': items.length,
            'itemsNeedingCheck': items
                .where(
                  (Map<String, Object?> item) =>
                      item['verificationRequired'] == true,
                )
                .length,
            'fromModel': items.length,
            'corrected': 0,
            'added': 0,
            'locationsKnown': items.length,
          },
          'items': items,
          'visualFindings': findings,
          'traditionalGuidance': <String, Object?>{
            'status': 'not_available',
            'reason': 'reviewed_rules_not_published',
          },
          'sources': <Object?>[],
          'disclaimer': <String, Object?>{
            'informational': true,
            'replacesQualifiedAdvice': false,
            'note': 'Observations describe what is visible in the photo.',
          },
        }
      : null,
};

Map<String, Object?> scriptedReportItem({
  String id = 'obs_001',
  String label = 'ganesh',
  String action = 'confirmed',
  bool verificationRequired = false,
}) => <String, Object?>{
  'id': id,
  'label': label,
  'category': 'deity_representation',
  'representationType': 'statue',
  'memberLabels': null,
  'verificationRequired': verificationRequired,
  'action': action,
  'located': true,
};

void main() {
  testWidgets('shows what was confirmed, and says guidance is not available yet', (
    WidgetTester tester,
  ) async {
    await pumpToReport(
      tester,
      report: scriptedReport(
        items: <Map<String, Object?>>[
          scriptedReportItem(id: 'obs_001', label: 'ganesh'),
          scriptedReportItem(
            id: 'obs_002',
            label: 'oil_lamp',
            action: 'corrected',
            verificationRequired: true,
          ),
          scriptedReportItem(id: 'user-1', label: 'bell', action: 'added'),
        ],
        findings: <Map<String, Object?>>[
          <String, Object?>{
            'code': 'crowding',
            'description': 'Several objects sit close together.',
            'relatedItems': <String>['obs_001'],
          },
        ],
      ),
    );

    // The counts lead, and the item list is the user's confirmed list with each item's
    // origin stated rather than implied.
    expect(find.text('Mandir scan complete'), findsOneWidget);
    expect(find.text('Items detected: 3'), findsOneWidget);
    // 'Ganesh' appears in the item list and again as the item a finding refers to.
    expect(find.text('Ganesh'), findsWidgets);
    expect(find.text('Oil lamp'), findsOneWidget);
    expect(find.textContaining('You corrected this'), findsOneWidget);
    expect(find.textContaining('You added this'), findsOneWidget);
    expect(find.textContaining('From the photo'), findsOneWidget);

    // The finding names the confirmed item it refers to.
    expect(find.text('Several objects sit close together.'), findsOneWidget);
    expect(find.text('Ganesh'), findsWidgets);

    // Traditional guidance is absent and says why, rather than being filled in. It sits
    // below the items, so the list has to be scrolled to build it.
    await tester.scrollUntilVisible(find.text('Traditional guidance'), 200);
    expect(find.text('Traditional guidance'), findsOneWidget);
    expect(find.textContaining('Not available yet'), findsOneWidget);
    expect(find.textContaining('per cent'), findsNothing);
  });

  testWidgets('says the report is being prepared instead of failing', (
    WidgetTester tester,
  ) async {
    await pumpToReport(tester, report: scriptedReport(available: false));

    expect(find.text('Your report is being prepared'), findsOneWidget);
    expect(find.text('Refresh'), findsOneWidget);
  });

  testWidgets('holds up at double text scale', (WidgetTester tester) async {
    await pumpToReport(
      tester,
      textScale: 2,
      report: scriptedReport(
        items: <Map<String, Object?>>[
          scriptedReportItem(label: 'ganesh', verificationRequired: true),
        ],
      ),
    );

    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.text('Traditional guidance'), 200);
    expect(find.text('Traditional guidance'), findsOneWidget);
  });
}
