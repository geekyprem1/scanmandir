import 'package:flutter/material.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../development/report_fixture.dart';

/// Source detail shell (PRD screen 13).
///
/// Shows the metadata fields a reviewed source will carry (P6-01). The warning is not
/// decoration: these are placeholders, and P6-02 forbids publishing placeholder
/// references as sources, so the screen states plainly that nothing has been reviewed.
class SourceDetailScreen extends StatelessWidget {
  const SourceDetailScreen({required this.sourceId, super.key});

  final String sourceId;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final FixtureSource? source = ReportFixture.sourceById(sourceId, l10n);

    if (source == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.reportSourcesTitle)),
        body: const FailureView(failure: Failure(kind: FailureKind.notFound)),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(source.title)),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            FixtureNotice(label: l10n.fixtureNotice),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(Insets.lg),
                children: <Widget>[
                  _PlaceholderWarning(text: l10n.sourcePlaceholderWarning),
                  const SizedBox(height: Insets.lg),
                  _Field(label: l10n.sourceFieldTitle, value: source.title),
                  _Field(label: l10n.sourceFieldEdition, value: source.edition),
                  _Field(
                    label: l10n.sourceFieldTradition,
                    value: source.tradition,
                  ),
                  _Field(
                    label: l10n.sourceFieldReviewer,
                    value: source.reviewer,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaceholderWarning extends StatelessWidget {
  const _PlaceholderWarning({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(Insets.md),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.info_outline, size: 20, color: scheme.onSurfaceVariant),
          const SizedBox(width: Insets.sm),
          Expanded(
            child: Text(
              text,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// One metadata field: label above value, so the value carries the reading weight.
class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Insets.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: Insets.xs),
          Text(value, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}
