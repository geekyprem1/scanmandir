import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/app/router.dart';
import 'package:scan_my_mandir/core/designsystem/app_theme.dart';
import 'package:scan_my_mandir/core/designsystem/app_widgets.dart';
import 'package:scan_my_mandir/core/environment.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/features/onboarding/application/onboarding_controller.dart';
import 'package:scan_my_mandir/l10n/generated/app_localizations.dart';

import '../support/fake_http_transport.dart';

/// The journey shells are development fixtures (P2-05); these tests walk them as the app
/// would.
class _CompletedOnboarding extends OnboardingController {
  @override
  bool build() => true;
}

class _HindiLocale extends LocaleController {
  @override
  Locale build() => const Locale('hi');
}

Future<void> pumpJourney(WidgetTester tester, {bool hindi = false}) async {
  await tester.pumpWidget(
    ProviderScope(
      // The override list type is intentionally inferred: Riverpod 3 does not export
      // the `Override` type from its public API.
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(FakeHttpTransport()),
        onboardingCompletedProvider.overrideWith(_CompletedOnboarding.new),
        if (hindi) localeControllerProvider.overrideWith(_HindiLocale.new),
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

/// Walks from Home to the report overview.
///
/// Everything before the report is real now, so the fixture walk is a single step: the
/// preview card opens the report fixture directly.
Future<void> walkToReport(
  WidgetTester tester, {
  String previewLabel = 'Journey preview (sample data)',
}) async {
  await tapAt(tester, find.widgetWithText(ActionCard, previewLabel));
}

void main() {
  testWidgets('home opens the journey and it walks to a report', (
    WidgetTester tester,
  ) async {
    await pumpJourney(tester);

    await tapAt(
      tester,
      find.widgetWithText(ActionCard, 'Journey preview (sample data)'),
    );

    // The report is the last screen still rendering a fixture, and it says so.
    expect(
      find.text(
        'Development preview with sample data — not a real scan result.',
      ),
      findsOneWidget,
    );
    expect(find.text('Mandir scan complete'), findsOneWidget);
    expect(find.text('Items detected: 4'), findsOneWidget);
    expect(find.text('Findings requiring review: 1'), findsOneWidget);
    expect(find.text('Findings requiring verification: 1'), findsOneWidget);
  });

  testWidgets('a finding shows its explainability blocks and its source', (
    WidgetTester tester,
  ) async {
    await pumpJourney(tester);
    await walkToReport(tester);

    await tapAt(tester, find.text('Two similar deity images'));
    expect(find.text('What we saw'), findsOneWidget);
    expect(find.text('Why it was flagged'), findsOneWidget);
    expect(find.text('What you can do'), findsOneWidget);

    await tapAt(tester, find.text('Household practice note (sample)'));
    expect(
      find.text(
        'This is a development sample. No source has been reviewed or approved yet.',
      ),
      findsOneWidget,
    );
    expect(find.text('Not reviewed'), findsOneWidget);
  });

  testWidgets('a verify finding states what could not be confirmed', (
    WidgetTester tester,
  ) async {
    await pumpJourney(tester);
    await walkToReport(tester);

    // The verify section sits below the fold on the test surface.
    await tester.scrollUntilVisible(
      find.text('Idol condition could not be confirmed'),
      200,
    );
    await tapAt(tester, find.text('Idol condition could not be confirmed'));
    expect(find.text('What could not be confirmed'), findsOneWidget);
  });

  testWidgets('the journey walks in Hindi', (WidgetTester tester) async {
    await pumpJourney(tester, hindi: true);

    await tapAt(
      tester,
      find.widgetWithText(ActionCard, 'यात्रा पूर्वावलोकन (नमूना डेटा)'),
    );
    expect(
      find.text(
        'डेवलपमेंट पूर्वावलोकन, नमूना डेटा के साथ — यह वास्तविक स्कैन परिणाम नहीं है।',
      ),
      findsOneWidget,
    );
    expect(find.text('मंदिर स्कैन पूरा हुआ'), findsOneWidget);
    expect(find.text('ठीक लगता है'), findsOneWidget);
    expect(find.text('सुरक्षा'), findsOneWidget);
  });

  group('fixture route guard', () {
    Future<GoRouter> pumpRouter(
      WidgetTester tester, {
      required bool allowFixtures,
    }) async {
      final GoRouter router = createRouter(
        showOnboarding: false,
        allowFixtures: allowFixtures,
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            environmentProvider.overrideWithValue(
              testEnvironment(flavor: AppFlavor.production),
            ),
            httpTransportProvider.overrideWithValue(FakeHttpTransport()),
          ],
          child: MaterialApp.router(
            routerConfig: router,
            theme: AppTheme.light(),
            locale: const Locale('en'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
          ),
        ),
      );
      await tester.pumpAndSettle();
      return router;
    }

    testWidgets(
      'a production build cannot reach fixture screens, even by deep link',
      (WidgetTester tester) async {
        final GoRouter router = await pumpRouter(tester, allowFixtures: false);

        router.go('/report');
        await tester.pumpAndSettle();

        expect(find.text('Mandir scan complete'), findsNothing);
        expect(
          find.text('Understand your home mandir, with tradition.'),
          findsOneWidget,
        );
      },
    );

    testWidgets('a development build can open a fixture screen directly', (
      WidgetTester tester,
    ) async {
      final GoRouter router = await pumpRouter(tester, allowFixtures: true);

      router.go('/report');
      await tester.pumpAndSettle();

      expect(find.text('Mandir scan complete'), findsOneWidget);
    });
  });
}
