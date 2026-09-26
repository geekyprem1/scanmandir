import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../development/journey_fixture.dart';

/// Context questions shell (P5-06): tradition and use, each with an explicit way out so
/// an unknown answer stays a stated unknown rather than a guess.
///
/// Answers are held in local state only and change nothing: the rules engine that would
/// consume them arrives with Phase 6.
class ContextQuestionsScreen extends StatefulWidget {
  const ContextQuestionsScreen({super.key});

  @override
  State<ContextQuestionsScreen> createState() => _ContextQuestionsScreenState();
}

class _ContextQuestionsScreenState extends State<ContextQuestionsScreen> {
  final Map<int, String> _answers = <int, String>{};

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<FixtureQuestion> questions = JourneyFixture.contextQuestions(
      l10n,
    );

    return Scaffold(
      appBar: AppBar(title: Text(l10n.contextTitle)),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            FixtureNotice(label: l10n.fixtureNotice),
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
                  for (final (int index, FixtureQuestion question)
                      in questions.indexed) ...<Widget>[
                    const SizedBox(height: Insets.lg),
                    Text(
                      question.question,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    RadioGroup<String>(
                      groupValue: _answers[index],
                      onChanged: (String? value) => _select(index, value),
                      child: Column(
                        children: <Widget>[
                          for (final String option in question.options)
                            RadioListTile<String>(
                              value: option,
                              title: Text(option),
                              contentPadding: EdgeInsets.zero,
                            ),
                        ],
                      ),
                    ),
                  ],
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
                onPressed: () => context.push('/report'),
                child: Text(l10n.viewReportAction),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _select(int question, String? value) {
    if (value != null) {
      setState(() => _answers[question] = value);
    }
  }
}
