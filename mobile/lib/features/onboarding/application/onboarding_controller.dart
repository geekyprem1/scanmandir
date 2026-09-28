import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';

/// Whether onboarding has been completed.
///
/// Loaded before routing and saved before the user leaves onboarding.
class OnboardingController extends Notifier<bool> {
  @override
  bool build() => ref.read(initialAppPreferencesProvider).onboardingCompleted;

  Future<void> complete() async {
    await ref.read(appPreferenceStoreProvider).completeOnboarding();
    state = true;
  }
}

final NotifierProvider<OnboardingController, bool> onboardingCompletedProvider =
    NotifierProvider<OnboardingController, bool>(OnboardingController.new);
