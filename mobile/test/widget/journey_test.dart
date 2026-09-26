import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:scan_my_mandir/app/router.dart';
import 'package:scan_my_mandir/core/designsystem/app_theme.dart';
import 'package:scan_my_mandir/core/environment.dart';
import 'package:scan_my_mandir/core/providers.dart';
import 'package:scan_my_mandir/l10n/generated/app_localizations.dart';

import '../support/fake_http_transport.dart';

/// The finding and source detail screens are the last fixtures in the app: the report
/// itself is real now, so these tests reach the remaining fixtures by deep link and check
/// that a production build cannot.
void main() {
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

      router.go('/report/finding/duplicate-deity-images');
      await tester.pumpAndSettle();

      expect(find.text('What we saw'), findsNothing);
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

    router.go('/report/finding/two-similar-images');
    await tester.pumpAndSettle();

    expect(find.text('What we saw'), findsOneWidget);
    expect(find.text('Why it was flagged'), findsOneWidget);
    expect(
      find.text(
        'Development preview with sample data — not a real scan result.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a development build can open a fixture source directly', (
    WidgetTester tester,
  ) async {
    final GoRouter router = await pumpRouter(tester, allowFixtures: true);

    router.go('/report/source/household-practice-note');
    await tester.pumpAndSettle();

    expect(
      find.text(
        'This is a development sample. No source has been reviewed or approved yet.',
      ),
      findsOneWidget,
    );
    expect(find.text('Not reviewed'), findsOneWidget);
  });
}
