import 'package:flutter/material.dart';

import 'app_typography.dart';

/// Theme for both light and dark.
///
/// Colour pairs come from Material's generated scheme rather than hand-picked hex values,
/// which keeps text-on-surface contrast within accessible ranges automatically. Text
/// geometry comes from [AppTypography]; nothing here sets a size of its own, so the app
/// stays readable at large system font scales (PRD section 33 accessibility, P2-07).
abstract final class AppTheme {
  /// A warm saffron-leaning seed, appropriate to the subject without being garish.
  static const Color _seed = Color(0xFFB4530A);

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: _seed,
      brightness: brightness,
    );
    final TextTheme text = AppTypography.textTheme(scheme);

    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      textTheme: text,
      visualDensity: VisualDensity.standard,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 2,
      ),
      cardTheme: CardThemeData(
        clipBehavior: Clip.antiAlias,
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: scheme.outlineVariant),
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      // Primary actions are full-width and 52dp tall so they are comfortable thumb
      // targets; secondary buttons keep Material's width but get a 48dp visual height
      // rather than the 40dp default. All three take their text style from the scale.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, 48),
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(64, 48),
          textStyle: text.labelLarge,
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 20, vertical: 6),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

/// Spacing scale. Using named steps rather than arbitrary numbers keeps screens
/// visually consistent as more of them are added.
abstract final class Insets {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
}
