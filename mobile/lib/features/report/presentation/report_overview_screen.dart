import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../scan/application/scan_submission_controller.dart';
import '../../scan/data/scan_api.dart';
import '../../scan/domain/scan_labels.dart';
import '../application/report_controller.dart';

/// The report (PRD sections 19–20, TASKS P7-04).
///
/// What is here is what the server could actually stand behind: what the user confirmed,
/// where each item came from, which ones still need a person's eye, the arrangement
/// observations that survived confirmation, and the disclaimer. The traditional guidance
/// section says it is not available yet, with the reason, because the reviewed rules and
/// sources are Phase 6 — a guidance section filled from the model's imagination would be
/// the one thing this product must never ship.
class ReportOverviewScreen extends ConsumerStatefulWidget {
  const ReportOverviewScreen({super.key});

  @override
  ConsumerState<ReportOverviewScreen> createState() =>
      _ReportOverviewScreenState();
}

class _ReportOverviewScreenState extends ConsumerState<ReportOverviewScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _load() {
    final String? scanId = ref
        .read(scanSubmissionControllerProvider)
        .valueOrNull
        ?.scanId;
    if (scanId != null) {
      ref.read(reportControllerProvider.notifier).load(scanId: scanId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final UiState<ScanReport> state = ref.watch(reportControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.reportTitle)),
      body: SafeArea(
        child: switch (state) {
          UiContent<ScanReport>(value: final ScanReport report) =>
            report.available
                ? _Report(report: report, onRefresh: _load)
                : _NotReady(onRefresh: _load),
          UiRecoverableError<ScanReport>(failure: final Failure failure) =>
            FailureView(failure: failure, onRetry: _load),
          UiTerminalError<ScanReport>(failure: final Failure failure) =>
            FailureView(failure: failure),
          _ =>
            ref.read(scanSubmissionControllerProvider.notifier).hasStarted
                ? LoadingView(label: l10n.reportTitle)
                : EmptyView(
                    icon: Icons.description_outlined,
                    title: l10n.scanNothingTitle,
                    detail: l10n.scanNothingDetail,
                    action: FilledButton(
                      onPressed: () => context.go('/upload'),
                      child: Text(l10n.scanNothingAction),
                    ),
                  ),
        },
      ),
    );
  }
}

class _NotReady extends StatelessWidget {
  const _NotReady({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return EmptyView(
      icon: Icons.hourglass_empty,
      title: l10n.reportNotReadyTitle,
      detail: l10n.reportNotReadyDetail,
      action: OutlinedButton.icon(
        onPressed: onRefresh,
        icon: const Icon(Icons.refresh),
        label: Text(l10n.actionRefresh),
      ),
    );
  }
}

class _Report extends StatelessWidget {
  const _Report({required this.report, required this.onRefresh});

  final ScanReport report;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ReportSummaryView summary =
        report.summary ??
        const ReportSummaryView(
          items: 0,
          itemsNeedingCheck: 0,
          fromModel: 0,
          corrected: 0,
          added: 0,
          locationsKnown: 0,
        );

    return ListView(
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
                  l10n.reportItemsDetected(summary.items),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                Text(
                  '${l10n.detectedNeedsVerification}: ${summary.itemsNeedingCheck}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                Text(
                  l10n.reportLocationsKnown(summary.locationsKnown),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
        _SectionTitle(title: l10n.reportItemsTitle),
        for (final ReportItemView item in report.items)
          ListTile(
            title: Text(labelDisplayName(l10n, item.label)),
            subtitle: Text(
              <String>[
                representationDisplayName(l10n, item.representationType),
                _originLabel(l10n, item.action),
                // The flag sits in the subtitle rather than the trailing slot: at a large
                // text scale a trailing chip crowds the title off the row.
                if (item.verificationRequired) l10n.detectedNeedsVerification,
              ].join(' · '),
            ),
          ),
        _SectionTitle(title: l10n.reportFindingsTitle),
        if (report.visualFindings.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: Insets.lg,
              vertical: Insets.sm,
            ),
            child: Text(
              l10n.detectedItemsEmptyTitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          )
        else
          for (final ReportFindingView finding in report.visualFindings)
            ListTile(
              title: Text(finding.description),
              subtitle: finding.relatedItems.isEmpty
                  ? null
                  : Text(
                      finding.relatedItems
                          .map((String id) => _itemLabel(l10n, id))
                          .join(', '),
                    ),
            ),
        _SectionTitle(title: l10n.reportGuidanceTitle),
        if (report.guidancePending)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Insets.lg),
            child: Card(
              color: Theme.of(context).colorScheme.surfaceContainerHigh,
              child: Padding(
                padding: const EdgeInsets.all(Insets.md),
                child: Text(
                  l10n.reportGuidancePending,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ),
          ),
        if (report.disclaimerNote != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              Insets.lg,
              Insets.lg,
              Insets.lg,
              Insets.lg,
            ),
            child: Text(
              report.disclaimerNote!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
      ],
    );
  }

  String _itemLabel(AppLocalizations l10n, String id) {
    for (final ReportItemView item in report.items) {
      if (item.id == id) return labelDisplayName(l10n, item.label);
    }
    return id;
  }

  String _originLabel(AppLocalizations l10n, String action) => switch (action) {
    'corrected' => l10n.reportOriginCorrected,
    'added' => l10n.reportOriginAdded,
    _ => l10n.reportOriginFromModel,
  };
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        Insets.sm,
        Insets.lg,
        Insets.sm,
        Insets.xs,
      ),
      child: Text(title, style: Theme.of(context).textTheme.titleSmall),
    );
  }
}
