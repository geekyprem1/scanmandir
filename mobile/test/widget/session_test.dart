import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/auth/auth_service.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show AuthRetryableFetchException;

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';

/// The session lifecycle as the Settings screen presents it.
class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

Future<void> pumpSettings(WidgetTester tester, FakeAuthService auth) async {
  await tester.pumpWidget(
    ProviderScope(
      // The override list type is intentionally inferred: Riverpod 3 does not export
      // the `Override` type from its public API.
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(FakeHttpTransport()),
        onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
        authServiceProvider.overrideWithValue(auth),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
  await tester.pumpAndSettle();

  await tester.tap(find.byTooltip('Settings'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a guest session is started on demand, not at launch', (
    WidgetTester tester,
  ) async {
    final FakeAuthService auth = FakeAuthService();
    await pumpSettings(tester, auth);

    expect(
      find.text(
        'No session yet. A guest session is created when you first scan.',
      ),
      findsOneWidget,
    );
    expect(
      auth.guestSignIns,
      0,
      reason: 'nothing may be called before the user asks',
    );

    await tester.tap(find.text('Start guest session'));
    await tester.pumpAndSettle();

    expect(auth.guestSignIns, 1);
    expect(find.text('Guest session'), findsOneWidget);
    expect(find.textContaining('test-guest-user'), findsOneWidget);
    expect(
      find.textContaining('Reinstalling the app or clearing its data'),
      findsOneWidget,
      reason: 'the guest notice is required by PRD section 7',
    );
  });

  testWidgets('a restored session is shown without any tap', (
    WidgetTester tester,
  ) async {
    final FakeAuthService auth = FakeAuthService(
      restored: const SessionIdentity(
        userId: 'restored-user',
        isAnonymous: true,
      ),
    );
    await pumpSettings(tester, auth);

    expect(find.text('Guest session'), findsOneWidget);
    expect(find.textContaining('restored-user'), findsOneWidget);
    expect(auth.guestSignIns, 0);
  });

  testWidgets('a failed start reports the reason and offers a retry', (
    WidgetTester tester,
  ) async {
    final FakeAuthService auth = FakeAuthService(
      failure: AuthRetryableFetchException(message: 'offline'),
    );
    await pumpSettings(tester, auth);

    await tester.tap(find.text('Start guest session'));
    await tester.pumpAndSettle();

    // The offline failure maps to the shared network copy, not to developer text.
    expect(find.text('No internet connection.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(auth.guestSignIns, 2);
    expect(find.text('No internet connection.'), findsOneWidget);
  });
}
