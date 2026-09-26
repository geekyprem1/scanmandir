import '../../../l10n/generated/app_localizations.dart';

/// Development fixtures for the scan journey shells (TASKS P2-05).
///
/// Illustrative samples only: nothing here is the result of a real analysis, and nothing
/// here is evidence for anything. They exist so the journey can be walked in both
/// languages before the capture, vision and rules pipeline exists (Phases 4–7). Delete
/// this file when the real pipeline lands.
///
/// The tradition options are illustrative; the launch taxonomy is not settled (P0-06).
class FixtureItem {
  const FixtureItem({required this.id, required this.name, this.kind});

  final String id;
  final String name;

  /// Representation type, e.g. idol or picture. Absent for items the user typed in.
  final String? kind;
}

/// One context question and its options.
///
/// Every question carries an explicit way out — "prefer not to say" or "not sure" — so
/// the user is never forced into an answer that does not fit (P5-06).
class FixtureQuestion {
  const FixtureQuestion({required this.question, required this.options});

  final String question;
  final List<String> options;
}

abstract final class JourneyFixture {
  /// Progress stages from PRD section 34: meaningful stage names, never a fabricated
  /// percentage.
  static List<String> stages(AppLocalizations l10n) => <String>[
    l10n.scanStageReceived,
    l10n.scanStageIdentifying,
    l10n.scanStageChecking,
  ];

  static List<FixtureItem> detectedItems(AppLocalizations l10n) =>
      <FixtureItem>[
        FixtureItem(
          id: 'lakshmi-idol',
          name: l10n.fixtureItemLakshmi,
          kind: l10n.fixtureKindIdol,
        ),
        FixtureItem(
          id: 'ganesha-picture',
          name: l10n.fixtureItemGanesha,
          kind: l10n.fixtureKindPicture,
        ),
        FixtureItem(
          id: 'diya',
          name: l10n.fixtureItemDiya,
          kind: l10n.fixtureKindLamp,
        ),
        FixtureItem(
          id: 'incense-holder',
          name: l10n.fixtureItemIncense,
          kind: l10n.fixtureKindPuja,
        ),
      ];

  static List<FixtureQuestion> contextQuestions(AppLocalizations l10n) =>
      <FixtureQuestion>[
        FixtureQuestion(
          question: l10n.contextTraditionQuestion,
          options: <String>[
            l10n.contextTraditionNorth,
            l10n.contextTraditionSouth,
            l10n.contextTraditionOther,
            l10n.contextNoSay,
          ],
        ),
        FixtureQuestion(
          question: l10n.contextFlameQuestion,
          options: <String>[
            l10n.contextFlameYes,
            l10n.contextFlameNo,
            l10n.contextFlameUnsure,
          ],
        ),
      ];
}
