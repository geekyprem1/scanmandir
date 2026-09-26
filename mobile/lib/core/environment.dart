import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

enum AppFlavor { development, staging, production }

/// Build-time configuration.
///
/// Values come from --dart-define so that a build cannot silently ship development
/// settings. No secret belongs here: anything in a Flutter build is readable by anyone
/// holding the APK. Provider credentials stay on the server (ARCHITECTURE.md section 12).
class Environment {
  const Environment({required this.flavor, required this.apiBaseUrl});

  final AppFlavor flavor;
  final Uri apiBaseUrl;

  bool get isProduction => flavor == AppFlavor.production;

  static const String _flavorDefine = String.fromEnvironment(
    'APP_FLAVOR',
    defaultValue: 'development',
  );
  static const String _apiBaseUrlDefine = String.fromEnvironment(
    'API_BASE_URL',
  );

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

    if (_apiBaseUrlDefine.isNotEmpty) {
      return Environment(
        flavor: flavor,
        apiBaseUrl: Uri.parse(_apiBaseUrlDefine),
      );
    }

    if (flavor != AppFlavor.development) {
      throw StateError(
        'API_BASE_URL must be provided via --dart-define for the $flavor flavor. '
        'There is no safe default for a non-development build.',
      );
    }

    final String host = !kIsWeb && Platform.isAndroid
        ? '10.0.2.2'
        : '127.0.0.1';
    return Environment(
      flavor: flavor,
      apiBaseUrl: Uri.parse('http://$host:3000'),
    );
  }
}
