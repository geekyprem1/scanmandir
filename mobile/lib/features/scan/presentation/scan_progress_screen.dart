import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../development/journey_fixture.dart';

/// Analysis progress shell (PRD screen 7; stages from section 34).
///
/// The stage list is the vocabulary the real progress screen will use — meaningful
/// stages, never a fabricated percentage (PRD section 34). The fixture shows all stages
/// complete so the journey can be walked; the live stage tracking arrives with the scan
/// lifecycle in Phase 4.
class ScanProgressScreen extends StatelessWidget {
  const ScanProgressScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.scanProgressTitle)),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            FixtureNotice(label: l10n.fixtureNotice),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(Insets.lg),
                children: <Widget>[
                  for (final String stage in JourneyFixture.stages(l10n))
                    ListTile(
                      leading: Icon(Icons.check_circle, color: scheme.tertiary),
                      title: Text(stage),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Insets.lg,
                0,
                Insets.lg,
                Insets.lg,
              ),
              child: FilledButton(
                onPressed: () => context.push('/scan/detected'),
                child: Text(l10n.actionContinue),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
