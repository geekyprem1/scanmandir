import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/designsystem/app_theme.dart';
import '../core/providers.dart';
import '../features/onboarding/application/onboarding_controller.dart';
import '../l10n/generated/app_localizations.dart';
import 'router.dart';

class ScanMyMandirApp extends ConsumerStatefulWidget {
  const ScanMyMandirApp({super.key});

  @override
  ConsumerState<ScanMyMandirApp> createState() => _ScanMyMandirAppState();
}

class _ScanMyMandirAppState extends ConsumerState<ScanMyMandirApp> {
  // Built once. Recreating the router on rebuild would reset navigation history, so a
  // language change must not rebuild it.
  late final GoRouter _router = createRouter(
    // A first launch opens onboarding (P2-03); later launches open Home.
    showOnboarding: !ref.read(onboardingCompletedProvider),
    // Journey shells render development fixtures only (P2-05); a release build must not
    // reach them.
    allowFixtures: !ref.read(environmentProvider).isProduction,
  );

  @override
  Widget build(BuildContext context) {
    final Locale locale = ref.watch(localeControllerProvider);

    return MaterialApp.router(
      title: 'Scan My Mandir',
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,

      // Explicit locale rather than the device default: the user's choice in Settings
      // wins, and switching it re-renders existing content without refetching.
      locale: locale,
      supportedLocales: LocaleController.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
