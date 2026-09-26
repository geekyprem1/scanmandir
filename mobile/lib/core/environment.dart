import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

enum AppFlavor { development, staging, production }

/// Build-time configuration.
///
/// Values come from --dart-define so that a build cannot silently ship development
/// settings. No secret belongs here: anything in a Flutter build is readable by anyone
/// holding the APK. Provider credentials stay on the server (ARCHITECTURE.md section 12).
///
/// The Supabase URL and publishable key are not secrets — every Supabase client build
/// ships them. Authorization is enforced by the server and by row-level rules, not by
/// hiding this value. The service-role key is the one that must never appear here.
class Environment {
  const Environment({
    required this.flavor,
    required this.apiBaseUrl,
    required this.supabaseUrl,
    required this.supabasePublishableKey,
  });

  final AppFlavor flavor;
  final Uri apiBaseUrl;

  /// Supabase project URL (docs/decisions.md D-15).
  final Uri supabaseUrl;

  /// Publishable ("anon") key.
  final String supabasePublishableKey;

  bool get isProduction => flavor == AppFlavor.production;

  static const String _flavorDefine = String.fromEnvironment(
    'APP_FLAVOR',
    defaultValue: 'development',
  );
  static const String _apiBaseUrlDefine = String.fromEnvironment(
    'API_BASE_URL',
  );
  static const String _supabaseUrlDefine = String.fromEnvironment(
    'SUPABASE_URL',
  );
  static const String _supabaseKeyDefine = String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
  );

  /// The shared development project (docs/decisions.md D-15). Only development builds
  /// fall back to these; every other flavor must be given its own values.
  static const String _developmentSupabaseUrl =
      'https://fuhngzfbxbbihwtlacsh.supabase.co';
  static const String _developmentSupabaseKey =
      'sb_publishable_h9X3JBFHRtuOCsC3pTgaGQ_ZZ0l_OEh';

  /// Resolves configuration for the current build.
  ///
  /// The Android emulator cannot reach the host machine on 127.0.0.1 — that address is
  /// the emulator itself. 10.0.2.2 is the host loopback alias, which is why the
  /// development default differs from the backend's own bind address.
  factory Environment.resolve() {
    final AppFlavor flavor = switch (_flavorDefine) {
      'production' => AppFlavor.production,
      'staging' => AppFlavor.staging,
      _ => AppFlavor.development,
    };

    if (flavor != AppFlavor.development) {
      if (_apiBaseUrlDefine.isEmpty) {
        throw StateError(
          'API_BASE_URL must be provided via --dart-define for the $flavor flavor. '
          'There is no safe default for a non-development build.',
        );
      }
      if (_supabaseUrlDefine.isEmpty || _supabaseKeyDefine.isEmpty) {
        throw StateError(
          'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be provided via --dart-define '
          'for the $flavor flavor, so a build cannot silently point at the development '
          'project.',
        );
      }
    }

    final String host = !kIsWeb && Platform.isAndroid
        ? '10.0.2.2'
        : '127.0.0.1';

    return Environment(
      flavor: flavor,
      apiBaseUrl: _apiBaseUrlDefine.isNotEmpty
          ? Uri.parse(_apiBaseUrlDefine)
          : Uri.parse('http://$host:3000'),
      supabaseUrl: Uri.parse(
        _supabaseUrlDefine.isNotEmpty
            ? _supabaseUrlDefine
            : _developmentSupabaseUrl,
      ),
      supabasePublishableKey: _supabaseKeyDefine.isNotEmpty
          ? _supabaseKeyDefine
          : _developmentSupabaseKey,
    );
  }
}
