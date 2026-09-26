import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/model/failure.dart';
import 'package:scan_my_mandir/core/model/ui_state.dart';

void main() {
  group('Failure.fromCode', () {
    test('maps the documented backend codes', () {
      expect(
        Failure.fromCode('QUOTA_EXCEEDED').kind,
        FailureKind.quotaExceeded,
      );
      expect(
        Failure.fromCode('REVISION_CONFLICT').kind,
        FailureKind.revisionConflict,
      );
      expect(
        Failure.fromCode('IMAGE_UNUSABLE').kind,
        FailureKind.imageUnusable,
      );
      expect(Failure.fromCode('IMAGE_EXPIRED').kind, FailureKind.imageExpired);
      expect(
        Failure.fromCode('ANALYSIS_UNAVAILABLE').kind,
        FailureKind.analysisUnavailable,
      );
      expect(Failure.fromCode('RESOURCE_DELETED').kind, FailureKind.notFound);
    });

    test('falls back to unknown for an unrecognized or absent code', () {
      expect(Failure.fromCode('SOMETHING_NEW').kind, FailureKind.unknown);
      expect(Failure.fromCode(null).kind, FailureKind.unknown);
    });
  });

  group('isRetryable', () {
    test('allows a plain retry for transient conditions', () {
      expect(const Failure.network().isRetryable, isTrue);
      expect(const Failure.timeout().isRetryable, isTrue);
      expect(Failure.fromCode('ANALYSIS_UNAVAILABLE').isRetryable, isTrue);
      expect(Failure.fromCode('INTERNAL').isRetryable, isTrue);
    });

    test(
      'refuses a plain retry when the user must do something different instead',
      () {
        // Repeating the same request would fail the same way. These need a re-read, a
        // retake, or a purchase, not a retry button.
        expect(Failure.fromCode('REVISION_CONFLICT').isRetryable, isFalse);
        expect(Failure.fromCode('IMAGE_UNUSABLE').isRetryable, isFalse);
        expect(Failure.fromCode('IMAGE_EXPIRED').isRetryable, isFalse);
        expect(Failure.fromCode('QUOTA_EXCEEDED').isRetryable, isFalse);
        expect(Failure.fromCode('FORBIDDEN').isRetryable, isFalse);
      },
    );
  });

  group('errorStateFor', () {
    test('routes a retryable failure to the recoverable state', () {
      expect(
        errorStateFor<int>(const Failure.network()),
        isA<UiRecoverableError<int>>(),
      );
    });

    test('routes a non-retryable failure to the terminal state', () {
      expect(
        errorStateFor<int>(Failure.fromCode('QUOTA_EXCEEDED')),
        isA<UiTerminalError<int>>(),
      );
    });
  });

  group('UiState accessors', () {
    test('exposes content only from the content state', () {
      expect(const UiContent<int>(7).valueOrNull, 7);
      expect(const UiLoading<int>().valueOrNull, isNull);
      expect(errorStateFor<int>(const Failure.network()).valueOrNull, isNull);
    });

    test('exposes a failure from either error state but not otherwise', () {
      expect(const UiLoading<int>().failureOrNull, isNull);
      expect(const UiContent<int>(1).failureOrNull, isNull);
      expect(
        errorStateFor<int>(const Failure.timeout()).failureOrNull,
        isNotNull,
      );
      expect(
        errorStateFor<int>(Failure.fromCode('FORBIDDEN')).failureOrNull,
        isNotNull,
      );
    });

    test('reports loading only while loading', () {
      expect(const UiLoading<int>().isLoading, isTrue);
      expect(const UiContent<int>(1).isLoading, isFalse);
    });
  });
}
