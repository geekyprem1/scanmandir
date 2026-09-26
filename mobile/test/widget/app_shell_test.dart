import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/environment.dart';
import 'package:scan_my_mandir/core/model/failure.dart';
import 'package:scan_my_mandir/core/network/http_transport.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';

import '../support/fake_http_transport.dart';

/// These tests exercise the app past onboarding; the flow itself is covered in
/// onboarding_test.dart.
class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

Future<void> pumpApp(
  WidgetTester tester, {
  FakeHttpTransport? transport,
  AppFlavor flavor = AppFlavor.development,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      // The override list type is intentionally inferred: Riverpod 3 does not export
      // the `Override` type from its public API.
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment(flavor: flavor)),
        httpTransportProvider.overrideWithValue(
          transport ?? FakeHttpTransport(),
        ),
        onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('home shows the primary scan action', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    expect(find.text('Scan My Mandir'), findsWidgets);
    expect(
      find.text('Understand your home mandir, with tradition.'),
      findsOneWidget,
    );
  });

  testWidgets('unbuilt features are hidden in a production build', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester, flavor: AppFlavor.production);

    // Settings is real; the rest are not built yet and must not be reachable.
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Upload Photo'), findsNothing);
    expect(find.text('My Reports'), findsNothing);
    expect(find.text('Mandir Profile'), findsNothing);
  });

  testWidgets('an unbuilt route is clearly labelled, never shown as a result', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.text('My Reports'));
    await tester.pumpAndSettle();

    expect(find.text('Not built yet'), findsOneWidget);
    expect(
      find.text(
        'This screen is part of a later phase. Nothing here is a real scan result.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('switching language re-renders existing screens without a reload', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('Language'), findsOneWidget);

    await tester.tap(find.text('हिन्दी'));
    await tester.pumpAndSettle();

    // Same route, same navigation stack, Hindi content.
    expect(find.text('सेटिंग्स'), findsWidgets);
    expect(find.text('भाषा'), findsOneWidget);

    // Going back shows the home screen in Hindi too.
    //
    // Tapped by type rather than with tester.pageBack(), which looks for a button
    // tooltipped 'Back' — that tooltip comes from MaterialLocalizations and is itself
    // translated once the locale is Hindi.
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('मंदिर स्कैन करें'), findsOneWidget);
  });

  testWidgets('the disclaimer is reachable from settings', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Terms and disclaimer'));
    await tester.pumpAndSettle();

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

  testWidgets('a reachable backend is reported as reachable', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();

    expect(find.text('Reachable'), findsOneWidget);
  });

  testWidgets(
    'an unreachable backend offers a retry rather than failing silently',
    (WidgetTester tester) async {
      await pumpApp(
        tester,
        transport: FakeHttpTransport(
          throwFailure: const TransportException(Failure.network()),
        ),
      );

      await tester.tap(find.byTooltip('Settings'));
      await tester.pumpAndSettle();

      // A network failure is recoverable, so the user gets an action, not a dead end.
      expect(find.text('Retry'), findsOneWidget);
    },
  );
}
