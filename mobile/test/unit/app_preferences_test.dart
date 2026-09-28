import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/app_preferences.dart';
import 'package:scan_my_mandir/core/platform/platform_adapters.dart';

class _MemorySecureStore implements SecureCredentialStore {
  final Map<String, String> values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);

  @override
  Future<void> clear() async => values.clear();
}

void main() {
  test(
    'restores language and onboarding without touching session keys',
    () async {
      final _MemorySecureStore storage = _MemorySecureStore();
      final SecureAppPreferenceStore preferences = SecureAppPreferenceStore(
        storage,
      );

      final AppPreferences first = await preferences.load();
      expect(first.locale, const Locale('en'));
      expect(first.onboardingCompleted, isFalse);

      await preferences.saveLocale(const Locale('hi'));
      await preferences.completeOnboarding();

      final AppPreferences restored = await SecureAppPreferenceStore(
        storage,
      ).load();
      expect(restored.locale, const Locale('hi'));
      expect(restored.onboardingCompleted, isTrue);
      expect(storage.values.containsKey('supabase_session'), isFalse);
    },
  );
}
