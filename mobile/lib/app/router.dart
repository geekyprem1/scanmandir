import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/designsystem/app_widgets.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/onboarding/presentation/onboarding_screen.dart';
import '../features/report/presentation/finding_detail_screen.dart';
import '../features/report/presentation/report_overview_screen.dart';
import '../features/report/presentation/source_detail_screen.dart';
import '../features/scan/presentation/context_questions_screen.dart';
import '../features/scan/presentation/detected_items_screen.dart';
import '../features/scan/presentation/scan_progress_screen.dart';
import '../features/settings/presentation/disclaimer_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../l10n/generated/app_localizations.dart';

/// Route table.
///
/// The scan journey is a sequence of routes rather than states inside one widget, so the
/// Android back button and process death behave predictably (TASKS P2-07). Routes for
/// unbuilt features exist and render an explicit placeholder — never anything that could
/// be mistaken for a real result.
///
/// [showOnboarding] is decided once at startup: whether the app opens on the onboarding
/// flow or on Home. It is a parameter rather than provider state because rebuilding the
/// router would reset navigation history.
///
/// [allowFixtures] gates the journey shells: until the real pipeline exists they render
/// development fixtures (P2-05), and a production build must not show them even through
/// a deep link. The guard disappears when the shells are replaced by real screens.
GoRouter createRouter({
  required bool showOnboarding,
  required bool allowFixtures,
}) {
  return GoRouter(
    initialLocation: showOnboarding ? '/onboarding' : '/',
    redirect: (BuildContext context, GoRouterState state) {
      if (allowFixtures) {
        return null;
      }
      final String path = state.uri.path;
      return path == '/scan' ||
              path.startsWith('/scan/') ||
              path == '/report' ||
              path.startsWith('/report/')
          ? '/'
          : null;
    },
    routes: <RouteBase>[
      GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),

      // Top level rather than nested under Settings: onboarding, Settings and every
      // report all link here (P2-08).
      GoRoute(path: '/disclaimer', builder: (_, _) => const DisclaimerScreen()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),

      // The journey, as shells over development fixtures (P2-05).
      GoRoute(
        path: '/scan',
        builder: (_, _) => const ScanProgressScreen(),
        routes: <RouteBase>[
          GoRoute(
            path: 'detected',
            builder: (_, _) => const DetectedItemsScreen(),
          ),
          GoRoute(
            path: 'context',
            builder: (_, _) => const ContextQuestionsScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/report',
        builder: (_, _) => const ReportOverviewScreen(),
        routes: <RouteBase>[
          GoRoute(
            path: 'finding/:id',
            builder: (_, GoRouterState state) =>
                FindingDetailScreen(findingId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: 'source/:id',
            builder: (_, GoRouterState state) =>
                SourceDetailScreen(sourceId: state.pathParameters['id']!),
          ),
        ],
      ),

      // Phase 4 onward. Placeholders, deliberately labelled.
      GoRoute(
        path: '/upload',
        builder: (_, _) => const _Placeholder(routeLabel: 'Upload Photo'),
      ),
      GoRoute(
        path: '/reports',
        builder: (_, _) => const _Placeholder(routeLabel: 'My Reports'),
      ),
      GoRoute(
        path: '/mandir',
        builder: (_, _) => const _Placeholder(routeLabel: 'Mandir Profile'),
      ),
    ],
    errorBuilder: (_, GoRouterState state) =>
        _Placeholder(routeLabel: state.uri.toString()),
  );
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.routeLabel});

  /// Developer-facing route label. Not localized: these screens do not ship.
  final String routeLabel;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(routeLabel)),
      body: NotImplementedView(
        title: l10n.notImplementedYet,
        detail: l10n.notImplementedDetail,
      ),
    );
  }
}
