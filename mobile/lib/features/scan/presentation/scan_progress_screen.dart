import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../application/scan_submission_controller.dart';

/// Analysis progress (PRD screen 7, stages from section 34).
///
/// The stages are the server's own states, named: the server reports what state a scan is
/// in, not how far along it is, so the screen shows the state and never invents a
/// percentage. A failure that the user can act on offers its action — retry for a
/// recoverable one, a way back to the picker for a terminal one.
class ScanProgressScreen extends ConsumerWidget {
  const ScanProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final UiState<ScanSubmission> state = ref.watch(
      scanSubmissionControllerProvider,
    );
    final ScanSubmissionController controller = ref.read(
      scanSubmissionControllerProvider.notifier,
    );

    return Scaffold(
      appBar: AppBar(title: Text(l10n.scanProgressTitle)),
      body: SafeArea(
        child: switch (state) {
          UiContent<ScanSubmission>(value: final ScanSubmission submission) =>
            _StageList(submission: submission),
          UiRecoverableError<ScanSubmission>(failure: final Failure failure) =>
            FailureView(failure: failure, onRetry: controller.retry),
          UiTerminalError<ScanSubmission>(failure: final Failure failure) =>
            _Halted(failure: failure),
          _ =>
            controller.hasStarted
                ? LoadingView(label: l10n.scanStageUploading)
                : EmptyView(
                    icon: Icons.photo_camera_outlined,
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

/// A terminal failure: the scan is not going to continue, so the screen explains and
/// offers the only action that helps — starting again with another photo.
class _Halted extends StatelessWidget {
  const _Halted({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Column(
      children: <Widget>[
        Expanded(child: FailureView(failure: failure)),
        Padding(
          padding: const EdgeInsets.fromLTRB(Insets.lg, 0, Insets.lg, Insets.lg),
          child: FilledButton(
            onPressed: () => context.go('/upload'),
            child: Text(l10n.scanNothingAction),
          ),
        ),
      ],
    );
  }
}

class _StageList extends StatelessWidget {
  const _StageList({required this.submission});

  final ScanSubmission submission;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final int current = ScanStage.values.indexOf(submission.stage);
    final bool stillWorking = submission.stage != ScanStage.readyForConfirmation;

    return ListView(
      padding: const EdgeInsets.all(Insets.lg),
      children: <Widget>[
        for (final (int index, ScanStage stage) in ScanStage.values.indexed)
          ListTile(
            selected: index == current,
            leading: Icon(
              index < current
                  ? Icons.check_circle
                  : index == current
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: index <= current ? scheme.primary : scheme.onSurfaceVariant,
            ),
            title: Text(
              _labelFor(l10n, stage),
              style: index == current
                  ? const TextStyle(fontWeight: FontWeight.w600)
                  : null,
            ),
          ),
        if (stillWorking)
          const Padding(
            padding: EdgeInsets.only(top: Insets.md),
            child: LinearProgressIndicator(),
          ),
      ],
    );
  }

  String _labelFor(AppLocalizations l10n, ScanStage stage) {
    return switch (stage) {
      ScanStage.uploading => l10n.scanStageUploading,
      ScanStage.analyzing => l10n.scanStageIdentifying,
      ScanStage.preparingReport => l10n.scanStagePreparingReport,
      ScanStage.readyForConfirmation => l10n.scanStageReady,
    };
  }
}
