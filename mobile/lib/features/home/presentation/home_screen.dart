import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/environment.dart';
import '../../../core/providers.dart';
import '../../../l10n/generated/app_localizations.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Environment environment = ref.watch(environmentProvider);

    // Unbuilt features are visible during development so the navigation can be walked,
    // and hidden in a production build so a user never taps into an empty screen
    // (TASKS P2-04).
    final bool showUnbuilt = !environment.isProduction;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appTitle),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: l10n.homeSettingsAction,
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Insets.md),
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: Insets.xs,
                vertical: Insets.md,
              ),
              child: Text(
                l10n.homeTagline,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            ActionCard(
              label: l10n.homeScanAction,
              icon: Icons.photo_camera_outlined,
              emphasised: true,
              onTap: () => context.push('/upload'),
            ),
            const SizedBox(height: Insets.sm),
            if (showUnbuilt) ...<Widget>[
              ActionCard(
                label: l10n.homePreviewJourneyAction,
                icon: Icons.science_outlined,
                onTap: () => context.push('/report'),
              ),
              const SizedBox(height: Insets.sm),
              ActionCard(
                label: l10n.homeMandirProfileAction,
                icon: Icons.home_outlined,
                onTap: () => context.push('/mandir'),
              ),
              const SizedBox(height: Insets.sm),
            ],
            ActionCard(
              label: l10n.homeReportsAction,
              icon: Icons.description_outlined,
              onTap: () => context.push('/reports'),
            ),
            const SizedBox(height: Insets.sm),
            ActionCard(
              label: l10n.homeSettingsAction,
              icon: Icons.settings_outlined,
              onTap: () => context.push('/settings'),
            ),
          ],
        ),
      ),
    );
  }
}
