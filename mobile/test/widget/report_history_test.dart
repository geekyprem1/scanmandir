import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/auth/auth_service.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';
import '../support/fake_scan_server.dart';

class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

void main() {
  testWidgets('a saved report opens from owner history', (
    WidgetTester tester,
  ) async {
    final FakeHttpTransport transport = FakeHttpTransport(
      responder: (RecordedCall call) async {
        if (call.path == '/v1/reports') {
          return scriptedAnswer(200, <String, Object?>{
            'items': <Object?>[
              <String, Object?>{
                'scanId': testScanId,
                'createdAt': '2026-09-26T10:00:00.000Z',
                'generatedAt': '2026-09-26T10:01:00.000Z',
                'itemCount': 0,
              },
            ],
            'nextCursor': null,
          });
        }
        if (call.path == '/v1/scans/$testScanId/report') {
          return scriptedAnswer(200, <String, Object?>{
            'scanId': testScanId,
            'available': true,
            'status': 'completed',
            'report': <String, Object?>{
              'inputRevision': 1,
              'summary': <String, Object?>{
                'items': 0,
                'itemsNeedingCheck': 0,
                'fromModel': 0,
                'corrected': 0,
                'added': 0,
                'locationsKnown': 0,
              },
              'items': <Object?>[],
              'visualFindings': <Object?>[],
              'traditionalGuidance': <String, Object?>{
                'status': 'not_available',
                'reason': 'reviewed_rules_not_published',
              },
            },
          });
        }
        return null;
      },
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          environmentProvider.overrideWithValue(testEnvironment()),
          httpTransportProvider.overrideWithValue(transport),
          onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
          authServiceProvider.overrideWithValue(
            FakeAuthService(
              restored: const SessionIdentity(
                userId: 'owner',
                isAnonymous: true,
              ),
            ),
          ),
        ],
        child: const ScanMyMandirApp(),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('My Reports'));
    await tester.pumpAndSettle();
    expect(find.text('0 items'), findsOneWidget);
    await tester.tap(find.text('0 items'));
    await tester.pumpAndSettle();
    expect(find.text('Mandir scan complete'), findsOneWidget);
    expect(
      transport.calls.any(
        (RecordedCall call) => call.path == '/v1/scans/$testScanId/report',
      ),
      isTrue,
    );
  });
}
