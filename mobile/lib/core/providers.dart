import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

/// Selected app language.
///
/// Held in memory for now. Persisting it across launches is P2-02; the getter and setter
/// shape will not change when that lands.
class LocaleController extends Notifier<Locale> {
  @override
  Locale build() => const Locale('en');

  void select(Locale locale) {
    if (!supportedLocales.contains(locale)) {
      throw ArgumentError.value(locale, 'locale', 'Not a supported locale');
    }
    state = locale;
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
