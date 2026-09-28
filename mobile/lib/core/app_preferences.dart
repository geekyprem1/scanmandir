import 'package:flutter/material.dart';

import 'platform/platform_adapters.dart';

/// Device-local choices loaded before the router is built.
class AppPreferences {
  const AppPreferences({
    required this.locale,
    required this.onboardingCompleted,
  });

  final Locale locale;
  final bool onboardingCompleted;
}

abstract interface class AppPreferenceStore {
  Future<AppPreferences> load();
  Future<void> saveLocale(Locale locale);
  Future<void> completeOnboarding();
}

class SecureAppPreferenceStore implements AppPreferenceStore {
  SecureAppPreferenceStore(this._storage);

  final SecureCredentialStore _storage;
  static const String _localeKey = 'app_locale';
  static const String _onboardingKey = 'app_onboarding_completed';

  @override
  Future<AppPreferences> load() async {
    final String? language = await _storage.read(_localeKey);
    final String? completed = await _storage.read(_onboardingKey);
    return AppPreferences(
      locale: Locale(language == 'hi' ? 'hi' : 'en'),
      onboardingCompleted: completed == 'true',
    );
  }

  @override
  Future<void> saveLocale(Locale locale) =>
      _storage.write(_localeKey, locale.languageCode);

  @override
  Future<void> completeOnboarding() => _storage.write(_onboardingKey, 'true');
}

/// Test/default implementation. Production supplies SecureAppPreferenceStore at boot.
class MemoryAppPreferenceStore implements AppPreferenceStore {
  Locale locale = const Locale('en');
  bool onboardingCompleted = false;

  @override
  Future<AppPreferences> load() async =>
      AppPreferences(locale: locale, onboardingCompleted: onboardingCompleted);

  @override
  Future<void> saveLocale(Locale value) async => locale = value;

  @override
  Future<void> completeOnboarding() async => onboardingCompleted = true;
}
