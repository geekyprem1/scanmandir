import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../application/detected_items_controller.dart';

/// Tradition and context questions (PRD screen 9, TASKS P5-06).
///
/// Every question has a way out that is not a guess — "prefer not to say" and "not sure" —
/// because an answer invented to satisfy a form would silently steer whatever depends on
/// it. A question left unanswered stays out of the confirmed input rather than defaulting
/// to the majority tradition.
///
/// This is also where the confirmation is sent: the answers belong to the same document as
/// the confirmed objects, so they commit together (TASKS P5-07).
class ContextQuestionsScreen extends ConsumerWidget {
  const ContextQuestionsScreen({super.key});

  /// Question ids as they are stored in the confirmed input.
  static const String traditionQuestion = 'tradition';
  static const String flameQuestion = 'open_flame';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final UiState<DetectedItemsState> state = ref.watch(
      detectedItemsControllerProvider,
    );
    final DetectedItemsController controller = ref.read(
      detectedItemsControllerProvider.notifier,
    );

    return Scaffold(
      appBar: AppBar(title: Text(l10n.contextTitle)),
      body: SafeArea(
        child: switch (state) {
          UiContent<DetectedItemsState>(value: final DetectedItemsState data) =>
            data.isConfirmed
                ? const _Confirmed()
                : _Questions(
                    data: data,
                    onAnswer: controller.answer,
                    onSubmit: controller.submit,
                  ),
          UiRecoverableError<DetectedItemsState>(
            failure: final Failure failure,
          ) =>
            FailureView(failure: failure, onRetry: controller.submit),
          UiTerminalError<DetectedItemsState>(failure: final Failure failure) =>
            FailureView(failure: failure),
          _ => EmptyView(
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

class _Confirmed extends StatelessWidget {
  const _Confirmed();

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Insets.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(
              Icons.check_circle,
              size: 40,
              color: Theme.of(context).colorScheme.tertiary,
            ),
            const SizedBox(height: Insets.md),
            Text(
              l10n.detectedConfirmedTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: Insets.sm),
            Text(
              l10n.detectedConfirmedDetail,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: Insets.lg),
            FilledButton(
              onPressed: () => context.go('/scan'),
              child: Text(l10n.actionContinue),
            ),
          ],
        ),
      ),
    );
  }
}

class _Questions extends StatelessWidget {
  const _Questions({
    required this.data,
    required this.onAnswer,
    required this.onSubmit,
  });

  final DetectedItemsState data;
  final void Function(String question, String value) onAnswer;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Column(
      children: <Widget>[
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(Insets.lg),
            children: <Widget>[
              Text(
                l10n.contextIntro,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: Insets.sm),
              _Question(
                question: l10n.contextTraditionQuestion,
                questionId: ContextQuestionsScreen.traditionQuestion,
                options: <String, String>{
                  l10n.contextTraditionNorth: 'north_indian',
                  l10n.contextTraditionSouth: 'south_indian',
                  l10n.contextTraditionOther: 'other',
                  l10n.contextNoSay: 'prefer_not_to_say',
                },
                selected:
                    data.context[ContextQuestionsScreen.traditionQuestion],
                onAnswer: onAnswer,
              ),
              _Question(
                question: l10n.contextFlameQuestion,
                questionId: ContextQuestionsScreen.flameQuestion,
                options: <String, String>{
                  l10n.contextFlameYes: 'yes',
                  l10n.contextFlameNo: 'no',
                  l10n.contextFlameUnsure: 'not_sure',
                },
                selected: data.context[ContextQuestionsScreen.flameQuestion],
                onAnswer: onAnswer,
              ),
              if (data.staleNotice)
                Padding(
                  padding: const EdgeInsets.only(top: Insets.md),
                  child: Text(
                    l10n.errorConflict,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.secondary,
                    ),
                  ),
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
            onPressed: data.submitting ? null : onSubmit,
            child: Text(
              data.submitting ? l10n.detectedSubmitting : l10n.detectedSubmit,
            ),
          ),
        ),
      ],
    );
  }
}

class _Question extends StatelessWidget {
  const _Question({
    required this.question,
    required this.questionId,
    required this.options,
    required this.selected,
    required this.onAnswer,
  });

  final String question;
  final String questionId;
  final Map<String, String> options;
  final String? selected;
  final void Function(String question, String value) onAnswer;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const SizedBox(height: Insets.md),
        Text(question, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: Insets.xs),
        Wrap(
          spacing: Insets.sm,
          children: <Widget>[
            for (final MapEntry<String, String> option in options.entries)
              ChoiceChip(
                label: Text(option.key),
                selected: selected == option.value,
                onSelected: (bool picked) {
                  if (!picked) return;
                  onAnswer(questionId, option.value);
                },
              ),
          ],
        ),
      ],
    );
  }
}
