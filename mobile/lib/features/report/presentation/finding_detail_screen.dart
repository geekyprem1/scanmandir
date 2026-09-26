import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../development/report_fixture.dart';

/// Finding detail shell: the explainability structure from PRD section 21 — what we saw,
/// why it was flagged, what you can do, and the source, with an explicit uncertainty
/// block where one applies. Empty blocks are omitted rather than padded with filler.
class FindingDetailScreen extends StatelessWidget {
  const FindingDetailScreen({required this.findingId, super.key});

  final String findingId;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final FixtureFinding? finding = ReportFixture.findingById(findingId, l10n);

    // Only reachable by a hand-written URL: the overview links to fixture ids only.
    if (finding == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.reportTitle)),
        body: const FailureView(failure: Failure(kind: FailureKind.notFound)),
      );
    }

    final FixtureSource? source = finding.sourceId == null
        ? null
        : ReportFixture.sourceById(finding.sourceId!, l10n);

    return Scaffold(
      appBar: AppBar(title: Text(finding.title)),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            FixtureNotice(label: l10n.fixtureNotice),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(Insets.lg),
                children: <Widget>[
                  Wrap(
                    spacing: Insets.sm,
                    runSpacing: Insets.sm,
                    children: <Widget>[
                      if (finding.isSafety)
                        StatusChip(
                          label: l10n.reportSectionSafety,
                          tone: StatusTone.review,
                        ),
                      StatusChip(
                        label: _statusLabel(l10n, finding.status),
                        tone: finding.status,
                      ),
                    ],
                  ),
                  const SizedBox(height: Insets.lg),
                  _Block(label: l10n.findingWhatWeSaw, text: finding.whatWeSaw),
                  if (finding.whyFlagged != null)
                    _Block(
                      label: l10n.findingWhyFlagged,
                      text: finding.whyFlagged!,
                    ),
                  if (finding.whatYouCanDo != null)
                    _Block(
                      label: l10n.findingWhatYouCanDo,
                      text: finding.whatYouCanDo!,
                    ),
                  if (finding.uncertainty != null)
                    _Block(
                      label: l10n.findingUncertainty,
                      text: finding.uncertainty!,
                    ),
                  if (source != null) ...<Widget>[
                    const SizedBox(height: Insets.sm),
                    Text(
                      l10n.findingSource,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(source.title),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push('/report/source/${source.id}'),
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

  static String _statusLabel(AppLocalizations l10n, StatusTone tone) =>
      switch (tone) {
        StatusTone.good => l10n.reportSectionGood,
        StatusTone.review => l10n.reportSectionReview,
        StatusTone.verify => l10n.reportSectionVerify,
        StatusTone.neutral => l10n.reportSectionReview,
      };
}

/// One labelled explainability block.
class _Block extends StatelessWidget {
  const _Block({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Insets.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: Insets.xs),
          Text(text, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}
