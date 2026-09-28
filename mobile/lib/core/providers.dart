import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_preferences.dart';
import 'environment.dart';
import 'network/api_client.dart';
import 'network/http_transport.dart';

/// Dependency wiring.
///
/// Every dependency is overridable, which is what lets widget tests run the real app
/// against a fake transport instead of a live server.
final Provider<Environment> environmentProvider = Provider<Environment>((
  Ref ref,
) {
  return Environment.resolve();
});

final Provider<HttpTransport> httpTransportProvider = Provider<HttpTransport>((
  Ref ref,
) {
  final IoHttpTransport transport = IoHttpTransport();
  ref.onDispose(transport.close);
  return transport;
});

final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((Ref ref) {
  return ApiClient(
    environment: ref.watch(environmentProvider),
    transport: ref.watch(httpTransportProvider),
  );
});

/// Selected app language, restored before the app's first frame.
final Provider<AppPreferenceStore> appPreferenceStoreProvider =
    Provider<AppPreferenceStore>((Ref ref) => MemoryAppPreferenceStore());

final Provider<AppPreferences> initialAppPreferencesProvider =
    Provider<AppPreferences>(
      (Ref ref) => const AppPreferences(
        locale: Locale('en'),
        onboardingCompleted: false,
      ),
    );

class LocaleController extends Notifier<Locale> {
  @override
  Locale build() => ref.read(initialAppPreferencesProvider).locale;

  Future<void> select(Locale locale) async {
    if (!supportedLocales.contains(locale)) {
      throw ArgumentError.value(locale, 'locale', 'Not a supported locale');
    }
    state = locale;
    await ref.read(appPreferenceStoreProvider).saveLocale(locale);
  }

  /// Hindi and English at launch. Further languages are LATER-02, and each needs a
  /// complete .arb file before it can be listed here.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
  ];
}

final NotifierProvider<LocaleController, Locale> localeControllerProvider =
    NotifierProvider<LocaleController, Locale>(LocaleController.new);
