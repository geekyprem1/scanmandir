import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/providers.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../application/onboarding_controller.dart';

/// First-launch onboarding (PRD section 7.1): language, what the product does, and what
/// happens to the user's photo.
///
/// Language comes first so the rest of the flow is read in the chosen language. The
/// disclaimer stays reachable from here as well as from Settings and every report
/// (P2-08).
///
/// Completion is held in memory until the storage decision at P0-02 lands, so the flow
/// currently appears on every launch rather than only on the first one.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  static const int _pageCount = 3;
  static const Duration _transition = Duration(milliseconds: 250);

  final PageController _pages = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _advance() {
    if (_index < _pageCount - 1) {
      _pages.nextPage(duration: _transition, curve: Curves.easeOutCubic);
      return;
    }

    ref.read(onboardingCompletedProvider.notifier).complete();
    context.go('/');
  }

  void _back() =>
      _pages.previousPage(duration: _transition, curve: Curves.easeOutCubic);

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Locale locale = ref.watch(localeControllerProvider);
    final bool isLast = _index == _pageCount - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(
              child: PageView(
                controller: _pages,
                onPageChanged: (int index) => setState(() => _index = index),
                children: <Widget>[
                  _OnboardingPage(
                    icon: Icons.translate,
                    title: l10n.onboardingLanguageTitle,
                    body: l10n.onboardingLanguageDetail,
                    child: RadioGroup<Locale>(
                      groupValue: locale,
                      onChanged: _selectLanguage,
                      child: Column(
                        children: <Widget>[
                          // Zero padding so the options line up with the text above.
                          RadioListTile<Locale>(
                            value: const Locale('en'),
                            title: Text(l10n.settingsLanguageEnglish),
                            contentPadding: EdgeInsets.zero,
                          ),
                          RadioListTile<Locale>(
                            value: const Locale('hi'),
                            title: Text(l10n.settingsLanguageHindi),
                            contentPadding: EdgeInsets.zero,
                          ),
                        ],
                      ),
                    ),
                  ),
                  _OnboardingPage(
                    icon: Icons.temple_hindu,
                    title: l10n.onboardingIntroTitle,
                    body: l10n.onboardingIntroBody,
                  ),
                  _OnboardingPage(
                    icon: Icons.privacy_tip_outlined,
                    title: l10n.onboardingPrivacyTitle,
                    body: l10n.onboardingPrivacyBody,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Insets.lg,
                0,
                Insets.lg,
                Insets.lg,
              ),
              child: Column(
                children: <Widget>[
                  _PageDots(count: _pageCount, index: _index),
                  const SizedBox(height: Insets.lg),
                  Row(
                    children: <Widget>[
                      if (_index > 0) ...<Widget>[
                        Expanded(
                          child: TextButton(
                            // Matches the primary button's height so the row reads as
                            // one control area.
                            style: TextButton.styleFrom(
                              minimumSize: const Size(64, 52),
                            ),
                            onPressed: _back,
                            child: Text(l10n.onboardingBack),
                          ),
                        ),
                        const SizedBox(width: Insets.sm),
                      ],
                      Expanded(
                        child: FilledButton(
                          onPressed: _advance,
                          child: Text(
                            isLast ? l10n.onboardingStart : l10n.onboardingNext,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (isLast) ...<Widget>[
                    const SizedBox(height: Insets.xs),
                    TextButton(
                      onPressed: () => context.push('/disclaimer'),
                      child: Text(l10n.disclaimerTitle),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _selectLanguage(Locale? value) {
    if (value != null) {
      ref.read(localeControllerProvider.notifier).select(value);
    }
  }
}

/// One onboarding step: icon, heading, body, and optional extra content.
///
/// Scrolls rather than overflows at large system font scales (P2-07).
class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({
    required this.icon,
    required this.title,
    required this.body,
    this.child,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final Widget? extra = child;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Insets.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, size: 48, color: scheme.primary),
            const SizedBox(height: Insets.lg),
            Text(title, style: text.headlineSmall),
            const SizedBox(height: Insets.md),
            Text(
              body,
              style: text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
            ),
            if (extra != null) ...<Widget>[
              const SizedBox(height: Insets.lg),
              extra,
            ],
          ],
        ),
      ),
    );
  }
}

/// Progress indicator for the flow. Decorative: each page's content is what a screen
/// reader should hear.
class _PageDots extends StatelessWidget {
  const _PageDots({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return ExcludeSemantics(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List<Widget>.generate(count, (int position) {
          final bool active = position == index;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.symmetric(horizontal: Insets.xs),
            width: active ? 20 : 8,
            height: 8,
            decoration: BoxDecoration(
              color: active ? scheme.primary : scheme.outlineVariant,
              borderRadius: BorderRadius.circular(4),
            ),
          );
        }),
      ),
    );
  }
}
