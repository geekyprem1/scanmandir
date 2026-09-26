import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/auth/session_controller.dart';
import 'package:scan_my_mandir/core/designsystem/app_widgets.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/home/presentation/home_screen.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';
import 'package:scan_my_mandir/features/report/presentation/report_overview_screen.dart';
import 'package:scan_my_mandir/features/scan/presentation/context_questions_screen.dart';

import '../support/fake_auth_service.dart';
import '../support/fake_http_transport.dart';

/// P2-07: system back navigation, app resume, large system text, and semantic labels.
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
        // Settings renders the session tile; tests must not reach for Supabase.
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

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200);
  await tester.pumpAndSettle();
}

void main() {
  group('large system text', () {
    testWidgets('home and settings hold up at double scale', (
      WidgetTester tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await pumpApp(tester);

      // Prove the scale actually applied before trusting any no-overflow claim.
      expect(
        MediaQuery.textScalerOf(
          tester.element(find.byType(Scaffold).first),
        ).scale(10),
        20,
      );
      expect(tester.takeException(), isNull);

      await tapAt(tester, find.byTooltip('Settings'));
      expect(tester.takeException(), isNull);
    });

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

    testWidgets('the whole fixture journey holds up at double scale', (
      WidgetTester tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await pumpApp(tester);

      await tapAt(
        tester,
        find.widgetWithText(ActionCard, 'Journey preview (sample data)'),
      );
      expect(tester.takeException(), isNull);

      await tapAt(tester, find.text('View report'));
      expect(tester.takeException(), isNull);

      await scrollTo(tester, find.text('Two similar deity images'));
      await tapAt(tester, find.text('Two similar deity images'));
      expect(tester.takeException(), isNull);

      await scrollTo(tester, find.text('Household practice note (sample)'));
      await tapAt(tester, find.text('Household practice note (sample)'));
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('system back walks the journey backwards', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tapAt(
      tester,
      find.widgetWithText(ActionCard, 'Journey preview (sample data)'),
    );
    await tapAt(tester, find.text('View report'));
    await scrollTo(tester, find.text('Two similar deity images'));
    await tapAt(tester, find.text('Two similar deity images'));

    // Each screen is asserted by type: a popped-to list keeps its scroll offset, so its
    // top content is not necessarily on screen.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(ReportOverviewScreen), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(ContextQuestionsScreen), findsOneWidget);

    // The fixture walk starts at the preview entry point, so this lands on Home.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  testWidgets('the journey keeps its place across background and resume', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tapAt(
      tester,
      find.widgetWithText(ActionCard, 'Journey preview (sample data)'),
    );
    await tapAt(tester, find.text('View report'));
    await scrollTo(tester, find.text('Two similar deity images'));
    await tapAt(tester, find.text('Two similar deity images'));
    expect(find.text('What we saw'), findsOneWidget);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    // Same screen, same content: nothing is rebuilt away by a trip to the background.
    expect(find.text('What we saw'), findsOneWidget);
  });
}
