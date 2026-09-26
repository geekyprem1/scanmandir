import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/designsystem/app_theme.dart';
import 'package:scan_my_mandir/core/designsystem/app_widgets.dart';
import 'package:scan_my_mandir/core/designsystem/failure_view.dart';
import 'package:scan_my_mandir/core/model/failure.dart';
import 'package:scan_my_mandir/l10n/generated/app_localizations.dart';

/// The theme as widgets actually see it.
///
/// [Theme.of] merges the locale's script-category geometry on top of the stored theme,
/// so reading the theme through a widget is the only check that the app's own sizes
/// survive that merge in both scripts.
Future<ThemeData> resolvedTheme(WidgetTester tester, ThemeData theme) async {
  late ThemeData resolved;
  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Builder(
        builder: (BuildContext context) {
          resolved = Theme.of(context);
          return const SizedBox.shrink();
        },
      ),
    ),
  );
  return resolved;
}

void main() {
  testWidgets('every Material text role is defined explicitly', (
    WidgetTester tester,
  ) async {
    final TextTheme text = (await resolvedTheme(
      tester,
      AppTheme.light(),
    )).textTheme;

    final List<TextStyle?> roles = <TextStyle?>[
      text.displayLarge,
      text.displayMedium,
      text.displaySmall,
      text.headlineLarge,
      text.headlineMedium,
      text.headlineSmall,
      text.titleLarge,
      text.titleMedium,
      text.titleSmall,
      text.bodyLarge,
      text.bodyMedium,
      text.bodySmall,
      text.labelLarge,
      text.labelMedium,
      text.labelSmall,
    ];

    expect(roles, hasLength(15));
    for (final TextStyle? role in roles) {
      expect(role?.fontSize, isNotNull);
      expect(role?.fontWeight, isNotNull);
      expect(role?.height, isNotNull);
    }
  });

  testWidgets('working sizes follow the app scale, not Material defaults', (
    WidgetTester tester,
  ) async {
    final TextTheme text = (await resolvedTheme(
      tester,
      AppTheme.light(),
    )).textTheme;

    expect(text.bodyLarge?.fontSize, 16);
    expect(text.titleLarge?.fontSize, 20);
    expect(text.titleMedium?.fontSize, 17);
    expect(text.titleMedium?.fontWeight, FontWeight.w600);
    expect(text.labelLarge?.fontSize, 17);
  });

  testWidgets('Devanagari gets leading and no Latin-only tracking', (
    WidgetTester tester,
  ) async {
    final TextTheme text = (await resolvedTheme(
      tester,
      AppTheme.dark(),
    )).textTheme;

    // English and Hindi share these styles, so the line box must leave room for matras
    // above and below the baseline.
    expect(text.bodyLarge?.height, greaterThanOrEqualTo(1.5));
    expect(text.bodyMedium?.height, greaterThanOrEqualTo(1.5));
    expect(text.bodyLarge?.letterSpacing, 0);
  });

  testWidgets('text colour follows the scheme in both brightnesses', (
    WidgetTester tester,
  ) async {
    final ThemeData light = await resolvedTheme(tester, AppTheme.light());
    expect(light.textTheme.bodyLarge?.color, light.colorScheme.onSurface);

    final ThemeData dark = await resolvedTheme(tester, AppTheme.dark());
    expect(dark.textTheme.bodyLarge?.color, dark.colorScheme.onSurface);
  });

  testWidgets('buttons are sized from the scale and meet the touch target', (
    WidgetTester tester,
  ) async {
    final ThemeData theme = await resolvedTheme(tester, AppTheme.light());

    final TextStyle? filledLabel = theme.filledButtonTheme.style?.textStyle
        ?.resolve(<WidgetState>{});
    expect(filledLabel?.fontSize, 17);
    expect(
      theme.filledButtonTheme.style?.minimumSize?.resolve(<WidgetState>{}),
      const Size(double.infinity, 52),
    );

    expect(
      theme.outlinedButtonTheme.style?.minimumSize
          ?.resolve(<WidgetState>{})
          ?.height,
      48,
    );
    expect(
      theme.textButtonTheme.style?.minimumSize
          ?.resolve(<WidgetState>{})
          ?.height,
      48,
    );
  });

  testWidgets('the loading state names the work exactly once', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: LoadingView(label: 'Analysing your photo')),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Analysing your photo'), findsOneWidget);
    // The visible label is excluded from semantics, so a screen reader announces one
    // node rather than reading the same words twice.
    expect(find.bySemanticsLabel('Analysing your photo'), findsOneWidget);

    // Disposed in the body rather than in a tear-down: the test framework checks for
    // leaked handles before tear-downs run.
    handle.dispose();
  });

  testWidgets('the empty state says what belongs here and how to fill it', (
    WidgetTester tester,
  ) async {
    bool tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EmptyView(
            icon: Icons.playlist_add,
            title: 'No items on the list',
            detail: 'Everything was removed.',
            action: TextButton(
              onPressed: () => tapped = true,
              child: const Text('Add item'),
            ),
          ),
        ),
      ),
    );

    expect(find.text('No items on the list'), findsOneWidget);
    expect(find.text('Everything was removed.'), findsOneWidget);

    await tester.tap(find.text('Add item'));
    expect(tapped, isTrue);
  });

  group('FailureView', () {
    Future<void> pumpFailure(
      WidgetTester tester,
      Failure failure, {
      VoidCallback? onRetry,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          // FailureView reads its wording from the app's own localization, so the
          // delegates have to be present even in a bare test harness.
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: FailureView(failure: failure, onRetry: onRetry),
          ),
        ),
      );
    }

    testWidgets('offline offers the retry it can use', (
      WidgetTester tester,
    ) async {
      bool retried = false;
      await pumpFailure(
        tester,
        const Failure.network(),
        onRetry: () => retried = true,
      );

      expect(find.text('No internet connection.'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      expect(retried, isTrue);
    });

    testWidgets('an expired session does not offer a retry that cannot help', (
      WidgetTester tester,
    ) async {
      await pumpFailure(
        tester,
        const Failure(kind: FailureKind.unauthenticated),
        onRetry: () {},
      );

      expect(
        find.text('Your session has expired. Sign in again to continue.'),
        findsOneWidget,
      );
      expect(find.text('Retry'), findsNothing);
    });

    testWidgets(
      'a failure kind never falls back to generic wording it does not need',
      (WidgetTester tester) async {
        await pumpFailure(
          tester,
          const Failure(kind: FailureKind.quotaExceeded),
        );
        expect(
          find.text('You have used all your scans for now.'),
          findsOneWidget,
        );

        await pumpFailure(
          tester,
          const Failure(kind: FailureKind.imageUnusable),
        );
        expect(
          find.text('This photo cannot be analysed. Take a new photo.'),
          findsOneWidget,
        );

        await pumpFailure(tester, const Failure(kind: FailureKind.notFound));
        expect(find.text('This is no longer available.'), findsOneWidget);
      },
    );
  });
}
