import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/app/app.dart';
import 'package:scan_my_mandir/core/app_preferences.dart';
import 'package:scan_my_mandir/core/providers.dart';

import '../support/fake_http_transport.dart';

/// A first launch: no onboarding override, so the app starts on the flow.
Future<void> pumpFirstLaunch(WidgetTester tester) async {
  await tester.pumpWidget(
    ProviderScope(
      // The override list type is intentionally inferred: Riverpod 3 does not export
      // the `Override` type from its public API.
      overrides: [
        environmentProvider.overrideWithValue(testEnvironment()),
        httpTransportProvider.overrideWithValue(FakeHttpTransport()),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> advance(WidgetTester tester, String label) async {
  await tester.tap(find.text(label));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('completed onboarding and language survive a new app instance', (
    WidgetTester tester,
  ) async {
    final MemoryAppPreferenceStore store = MemoryAppPreferenceStore();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          environmentProvider.overrideWithValue(testEnvironment()),
          httpTransportProvider.overrideWithValue(FakeHttpTransport()),
          appPreferenceStoreProvider.overrideWithValue(store),
        ],
        child: const ScanMyMandirApp(),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('हिन्दी'));
    await tester.pumpAndSettle();
    await advance(tester, 'आगे');
    await advance(tester, 'आगे');
    await advance(tester, 'शुरू करें');

    final AppPreferences restored = await store.load();
    expect(restored.locale, const Locale('hi'));
    expect(restored.onboardingCompleted, isTrue);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          environmentProvider.overrideWithValue(testEnvironment()),
          httpTransportProvider.overrideWithValue(FakeHttpTransport()),
          appPreferenceStoreProvider.overrideWithValue(store),
          initialAppPreferencesProvider.overrideWithValue(restored),
        ],
        child: const ScanMyMandirApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('अपनी भाषा चुनें'), findsNothing);
    expect(find.text('मंदिर स्कैन करें'), findsOneWidget);
  });

  testWidgets('a first launch opens onboarding rather than home', (
    WidgetTester tester,
  ) async {
    await pumpFirstLaunch(tester);

    expect(find.text('Choose your language'), findsOneWidget);
    // Home is not reachable behind the flow.
    expect(find.text('Upload Photo'), findsNothing);
  });

  testWidgets('the language step re-renders the flow immediately', (
    WidgetTester tester,
  ) async {
    await pumpFirstLaunch(tester);

    await tester.tap(find.text('हिन्दी'));
    await tester.pumpAndSettle();

    expect(find.text('अपनी भाषा चुनें'), findsOneWidget);
    expect(find.text('आगे'), findsOneWidget);
  });

  testWidgets('walking the flow reaches home', (WidgetTester tester) async {
    await pumpFirstLaunch(tester);

    await advance(tester, 'Next');
    expect(find.text('Understand your home mandir'), findsOneWidget);

    await advance(tester, 'Next');
    expect(find.text('Your photo, your privacy'), findsOneWidget);

    await advance(tester, 'Get started');
    expect(
      find.text('Understand your home mandir, with tradition.'),
      findsOneWidget,
    );
  });

  testWidgets('back moves to the previous step', (WidgetTester tester) async {
    await pumpFirstLaunch(tester);

    await advance(tester, 'Next');
    await advance(tester, 'Back');

    expect(find.text('Choose your language'), findsOneWidget);
  });

  testWidgets('the disclaimer is reachable from onboarding', (
    WidgetTester tester,
  ) async {
    await pumpFirstLaunch(tester);

    await advance(tester, 'Next');
    await advance(tester, 'Next');
    await advance(tester, 'Terms and disclaimer');

    expect(
      find.textContaining('does not replace a qualified priest'),
      findsOneWidget,
    );
  });
}
