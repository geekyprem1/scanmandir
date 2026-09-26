import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// The app's type scale.
///
/// Sizes sit in the phone reading range rather than Material's desktop defaults, and
/// hierarchy comes from weight and colour as much as from size. Every Material text role
/// is defined here so no widget or theme entry sets a size of its own; the user's system
/// font scale still applies on top of this base (PRD section 33, TASKS P2-07).
///
/// Two constraints shape the scale:
///
/// * **Devanagari.** Hindi matras sit above and below the baseline, so body line heights
///   are generous and text is laid out with [TextLeadingDistribution.even], which keeps
///   the line box centred in both scripts. Material's letter tracking is removed: it is
///   tuned for Roboto and only loosens Devanagari for no benefit.
/// * **Language parity.** English and Hindi share one scale; nothing is sized per
///   language, so switching language cannot change layout height.
///
/// Font family is deliberately unset. The platform default — Roboto, with Noto Sans
/// Devanagari as the fallback for Hindi — renders both supported languages without
/// bundling font assets.
abstract final class AppTypography {
  /// The [TextTheme] for [scheme], light or dark.
  ///
  /// Colours come from the scheme so text-on-surface contrast stays in the range
  /// Material already guarantees; this class owns geometry only.
  static TextTheme textTheme(ColorScheme scheme) {
    final Typography typography = Typography.material2021(
      platform: defaultTargetPlatform,
      colorScheme: scheme,
    );
    final TextTheme base = scheme.brightness == Brightness.dark
        ? typography.white
        : typography.black;

    return base.copyWith(
      displayLarge: _role(
        base.displayLarge,
        size: 57,
        weight: FontWeight.w400,
        height: 1.12,
      ),
      displayMedium: _role(
        base.displayMedium,
        size: 45,
        weight: FontWeight.w400,
        height: 1.16,
      ),
      displaySmall: _role(
        base.displaySmall,
        size: 36,
        weight: FontWeight.w400,
        height: 1.22,
      ),
      headlineLarge: _role(
        base.headlineLarge,
        size: 32,
        weight: FontWeight.w600,
        height: 1.25,
      ),
      headlineMedium: _role(
        base.headlineMedium,
        size: 28,
        weight: FontWeight.w600,
        height: 1.3,
      ),
      headlineSmall: _role(
        base.headlineSmall,
        size: 24,
        weight: FontWeight.w600,
        height: 1.3,
      ),
      titleLarge: _role(
        base.titleLarge,
        size: 20,
        weight: FontWeight.w600,
        height: 1.35,
      ),
      titleMedium: _role(
        base.titleMedium,
        size: 17,
        weight: FontWeight.w600,
        height: 1.4,
      ),
      titleSmall: _role(
        base.titleSmall,
        size: 15,
        weight: FontWeight.w600,
        height: 1.4,
      ),
      bodyLarge: _role(
        base.bodyLarge,
        size: 16,
        weight: FontWeight.w400,
        height: 1.6,
      ),
      bodyMedium: _role(
        base.bodyMedium,
        size: 14,
        weight: FontWeight.w400,
        height: 1.55,
      ),
      bodySmall: _role(
        base.bodySmall,
        size: 12,
        weight: FontWeight.w400,
        height: 1.5,
      ),
      labelLarge: _role(
        base.labelLarge,
        size: 17,
        weight: FontWeight.w600,
        height: 1.2,
      ),
      labelMedium: _role(
        base.labelMedium,
        size: 13,
        weight: FontWeight.w500,
        height: 1.25,
      ),
      labelSmall: _role(
        base.labelSmall,
        size: 11,
        weight: FontWeight.w600,
        height: 1.2,
      ),
    );
  }

  static TextStyle? _role(
    TextStyle? base, {
    required double size,
    required FontWeight weight,
    required double height,
  }) {
    return base?.copyWith(
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: 0,
      leadingDistribution: TextLeadingDistribution.even,
    );
  }
}
