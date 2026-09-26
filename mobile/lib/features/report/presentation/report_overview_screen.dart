import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../development/report_fixture.dart';

/// Report overview shell (PRD section 19).
///
/// Safety findings come first because safety takes display priority over aesthetic and
/// traditional guidance (PRD section 19). Statuses are the PRD section 20 set — Looks
/// Good, Review, Verify — with no red emergency styling for ordinary differences. The
/// summary counts match the sections below them: safety findings are counted in their
/// own section, not in the review count.
class ReportOverviewScreen extends StatelessWidget {
  const ReportOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<FixtureFinding> findings = ReportFixture.findings(l10n);
    final List<FixtureSource> sources = ReportFixture.sources(l10n);

    final List<FixtureFinding> safety = findings
        .where((FixtureFinding f) => f.isSafety)
        .toList();
    final List<FixtureFinding> good = findings
        .where((FixtureFinding f) => !f.isSafety && f.status == StatusTone.good)
        .toList();
    final List<FixtureFinding> review = findings
        .where(
          (FixtureFinding f) => !f.isSafety && f.status == StatusTone.review,
        )
        .toList();
    final List<FixtureFinding> verify = findings
        .where((FixtureFinding f) => f.status == StatusTone.verify)
        .toList();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.reportTitle)),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            FixtureNotice(label: l10n.fixtureNotice),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(Insets.md),
                children: <Widget>[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(Insets.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            l10n.reportComplete,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: Insets.sm),
                          Text(
                            l10n.reportItemsDetected(
                              ReportFixture.itemsDetected,
                            ),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          Text(
                            l10n.reportNeedingReview(review.length),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          Text(
                            l10n.reportNeedingVerify(verify.length),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                  ),
                  _FindingSection(
                    title: l10n.reportSectionSafety,
                    findings: safety,
                  ),
                  _FindingSection(
                    title: l10n.reportSectionGood,
                    findings: good,
                  ),
                  _FindingSection(
                    title: l10n.reportSectionReview,
                    findings: review,
                  ),
                  _FindingSection(
                    title: l10n.reportSectionVerify,
                    findings: verify,
                  ),
                  if (sources.isNotEmpty) ...<Widget>[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        Insets.sm,
                        Insets.lg,
                        Insets.sm,
                        Insets.xs,
                      ),
                      child: Text(
                        l10n.reportSourcesTitle,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                    for (final FixtureSource source in sources)
                      ListTile(
                        title: Text(source.title),
                        subtitle: Text(source.tradition),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () =>
                            context.push('/report/source/${source.id}'),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A status section with its findings. An empty section renders nothing.
class _FindingSection extends StatelessWidget {
  const _FindingSection({required this.title, required this.findings});

  final String title;
  final List<FixtureFinding> findings;

  @override
  Widget build(BuildContext context) {
    if (findings.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(
            Insets.sm,
            Insets.lg,
            Insets.sm,
            Insets.xs,
          ),
          child: Text(title, style: Theme.of(context).textTheme.titleSmall),
        ),
        for (final FixtureFinding finding in findings)
          ListTile(
            title: Text(finding.title),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/report/finding/${finding.id}'),
          ),
      ],
    );
  }
}
