import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether onboarding has been completed.
///
/// In memory only. Persisting it needs the storage choice still open under P0-02 — the
/// same decision that keeps the language preference (P2-02) in memory — so until that
/// lands, every launch counts as a first launch.
class OnboardingController extends Notifier<bool> {
  @override
  bool build() => false;

  void complete() => state = true;
}

final NotifierProvider<OnboardingController, bool> onboardingCompletedProvider =
    NotifierProvider<OnboardingController, bool>(OnboardingController.new);
