import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../model/failure.dart';
import 'app_widgets.dart';

/// Standard presentation for a [Failure].
///
/// Screens should not hand-write error copy. The wording for every [FailureKind] lives
/// here in both languages, and the retry affordance follows [Failure.isRetryable] — so an
/// offline or transient failure offers a retry, while a conflict, an expired session or
/// an unusable photo does not offer one that cannot help. A screen that needs a
/// different action (retake, sign in, upgrade) adds it around this view rather than
/// rewriting the message.
class FailureView extends StatelessWidget {
  const FailureView({required this.failure, this.onRetry, super.key});

  final Failure failure;

  /// Called when the user taps retry. The button appears only for a retryable failure.
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return ErrorView(
      message: messageFor(l10n, failure.kind),
      onRetry: failure.isRetryable ? onRetry : null,
      retryLabel: l10n.actionRetry,
    );
  }

  /// The localized message for [kind].
  ///
  /// Exposed separately so a screen that embeds the message differently — a dialog, a
  /// form error — still uses the same reviewed wording.
  static String messageFor(AppLocalizations l10n, FailureKind kind) =>
      switch (kind) {
        FailureKind.network => l10n.errorNoConnection,
        FailureKind.timeout => l10n.errorTimeout,
        FailureKind.server => l10n.errorUnexpected,
        FailureKind.unauthenticated => l10n.errorSessionExpired,
        FailureKind.forbidden => l10n.errorNotPermitted,
        FailureKind.notFound => l10n.errorNotFound,
        FailureKind.revisionConflict => l10n.errorConflict,
        FailureKind.quotaExceeded => l10n.errorQuotaExceeded,
        FailureKind.imageUnusable => l10n.errorImageUnusable,
        FailureKind.imageExpired => l10n.errorImageExpired,
        FailureKind.analysisUnavailable => l10n.errorAnalysisUnavailable,
        FailureKind.unknown => l10n.errorUnexpected,
      };
}
