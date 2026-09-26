import '../../../core/designsystem/app_widgets.dart';
import '../../../l10n/generated/app_localizations.dart';

/// One finding in the report fixture, shaped like the report the real pipeline will
/// produce: a status from PRD section 20 and the explainability blocks from section 21.
/// Safety is a separate flag, not a severity — safety priority is independent of status.
class FixtureFinding {
  const FixtureFinding({
    required this.id,
    required this.title,
    required this.whatWeSaw,
    required this.status,
    this.isSafety = false,
    this.whyFlagged,
    this.whatYouCanDo,
    this.uncertainty,
    this.sourceId,
  });

  final String id;
  final String title;
  final String whatWeSaw;
  final StatusTone status;
  final bool isSafety;
  final String? whyFlagged;
  final String? whatYouCanDo;
  final String? uncertainty;
  final String? sourceId;
}

/// Source metadata as it will be stored from P6-01. The fixture values are placeholders
/// on purpose: no source has been reviewed or approved, and none may be published
/// (P6-02).
class FixtureSource {
  const FixtureSource({
    required this.id,
    required this.title,
    required this.edition,
    required this.tradition,
    required this.reviewer,
  });

  final String id;
  final String title;
  final String edition;
  final String tradition;
  final String reviewer;
}

/// Development fixtures for the report shells (TASKS P2-05).
///
/// Illustrative samples only — never real findings, never real sources. Delete this file
/// when the report pipeline lands in Phases 6–7.
abstract final class ReportFixture {
  /// Kept in step with the detected-items fixture in the scan feature. Object counts and
  /// finding counts are independent (PRD section 19): one item can support several
  /// findings.
  static const int itemsDetected = 4;

  static List<FixtureFinding> findings(AppLocalizations l10n) =>
      <FixtureFinding>[
        FixtureFinding(
          id: 'open-flame-safety',
          title: l10n.fixtureSafetyTitle,
          whatWeSaw: l10n.fixtureSafetySaw,
          whyFlagged: l10n.fixtureSafetyWhy,
          whatYouCanDo: l10n.fixtureSafetyDo,
          status: StatusTone.review,
          isSafety: true,
          sourceId: 'flame-safety-note',
        ),
        FixtureFinding(
          id: 'mandir-organized',
          title: l10n.fixtureGoodTitle,
          whatWeSaw: l10n.fixtureGoodSaw,
          status: StatusTone.good,
        ),
        FixtureFinding(
          id: 'two-similar-images',
          title: l10n.fixtureReviewTitle,
          whatWeSaw: l10n.fixtureReviewSaw,
          whyFlagged: l10n.fixtureReviewWhy,
          whatYouCanDo: l10n.fixtureReviewDo,
          status: StatusTone.review,
          sourceId: 'household-practice-note',
        ),
        FixtureFinding(
          id: 'idol-condition',
          title: l10n.fixtureVerifyTitle,
          whatWeSaw: l10n.fixtureVerifySaw,
          whyFlagged: l10n.fixtureVerifyWhy,
          whatYouCanDo: l10n.fixtureVerifyDo,
          uncertainty: l10n.fixtureVerifyUncertainty,
          status: StatusTone.verify,
        ),
      ];

  static List<FixtureSource> sources(AppLocalizations l10n) => <FixtureSource>[
    FixtureSource(
      id: 'household-practice-note',
      title: l10n.fixtureSource1Title,
      edition: l10n.fixtureSource1Edition,
      tradition: l10n.fixtureSourceTraditionIllustrative,
      reviewer: l10n.fixtureSourceReviewer,
    ),
    FixtureSource(
      id: 'flame-safety-note',
      title: l10n.fixtureSource2Title,
      edition: l10n.fixtureSource2Edition,
      tradition: l10n.fixtureSourceTraditionNotSpecific,
      reviewer: l10n.fixtureSourceReviewer,
    ),
  ];

  /// The finding for [id], or null when the id is not part of the fixture.
  static FixtureFinding? findingById(String id, AppLocalizations l10n) {
    for (final FixtureFinding finding in findings(l10n)) {
      if (finding.id == id) {
        return finding;
      }
    }
    return null;
  }

  /// The source for [id], or null when the id is not part of the fixture.
  static FixtureSource? sourceById(String id, AppLocalizations l10n) {
    for (final FixtureSource source in sources(l10n)) {
      if (source.id == id) {
        return source;
      }
    }
    return null;
  }
}
