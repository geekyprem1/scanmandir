import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';

class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

Future<void> pumpApp(WidgetTester tester, {bool firstLaunch = false}) async {
  await tester.pumpWidget(
    ProviderScope(
      // The override list type is intentionally inferred: Riverpod 3 does not export
      // the `Override` type from its public API.
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(FakeHttpTransport()),
        if (!firstLaunch)
          onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
        authServiceProvider.overrideWithValue(FakeAuthService()),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> tapAt(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  group('large system text', () {
    testWidgets('onboarding holds up at double scale', (
      WidgetTester tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await pumpApp(tester, firstLaunch: true);
      expect(tester.takeException(), isNull);

      await tapAt(tester, find.text('Next'));
      expect(tester.takeException(), isNull);

      await tapAt(tester, find.text('Next'));
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('the disclaimer is reachable and readable', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tapAt(tester, find.byTooltip('Settings'));
    await tapAt(tester, find.text('Terms and disclaimer'));

    expect(
      find.textContaining('does not replace a qualified priest'),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'does not detect spiritual or supernatural conditions',
      ),
      findsOneWidget,
    );
  });
}
