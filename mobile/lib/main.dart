import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';
import 'core/app_preferences.dart';
import 'core/auth/secure_session_storage.dart';
import 'core/environment.dart';
import 'core/platform/secure_storage.dart';
import 'core/providers.dart';

Future<void> main() async {
  // Session restore touches secure storage through platform channels, so the binding
  // must exist before Supabase is initialized.
  WidgetsFlutterBinding.ensureInitialized();

  final Environment environment = Environment.resolve();
  final FlutterSecureCredentialStore credentials =
      FlutterSecureCredentialStore();
  final SecureAppPreferenceStore preferences = SecureAppPreferenceStore(
    credentials,
  );
  final AppPreferences initialPreferences = await preferences.load();

  await Supabase.initialize(
    url: environment.supabaseUrl.toString(),
    publishableKey: environment.supabasePublishableKey,
    authOptions: FlutterAuthClientOptions(
      // Tokens go to keystore-backed storage, never to shared preferences
      // (ARCHITECTURE.md section 4).
      localStorage: SecureSessionStorage(credentials),
      pkceAsyncStorage: SecurePkceStorage(credentials),
    ),
  );

  runApp(
    ProviderScope(
      overrides: [
        appPreferenceStoreProvider.overrideWithValue(preferences),
        initialAppPreferencesProvider.overrideWithValue(initialPreferences),
      ],
      child: const ScanMyMandirApp(),
    ),
  );
}
