import 'package:flutter/material.dart';

import 'app_theme.dart';

/// Status colour for a finding or a check.
///
/// Mirrors the three report statuses in PRD section 20. Red is absent on purpose: an
/// ordinary difference between traditions must not be dressed up as an emergency.
enum StatusTone { good, review, verify, neutral }

class StatusChip extends StatelessWidget {
  const StatusChip({required this.label, required this.tone, super.key});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    final (Color background, Color foreground) = switch (tone) {
      StatusTone.good => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      StatusTone.review => (
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      StatusTone.verify => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
      StatusTone.neutral => (
        scheme.surfaceContainerHigh,
        scheme.onSurfaceVariant,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: Insets.sm + 2,
        vertical: Insets.xs + 1,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelMedium?.copyWith(color: foreground),
      ),
    );
  }
}

/// A large tappable card used for the primary actions on the home screen.
class ActionCard extends StatelessWidget {
  const ActionCard({
    required this.label,
    required this.icon,
    required this.onTap,
    this.subtitle,
    this.emphasised = false,
    super.key,
  });

  final String label;
  final String? subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  final bool emphasised;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Card(
      color: emphasised ? scheme.primaryContainer : null,
      child: ListTile(
        // Disabled state is conveyed to assistive technology, not just visually.
        enabled: onTap != null,
        leading: Icon(
          icon,
          color: emphasised ? scheme.onPrimaryContainer : scheme.primary,
          size: 28,
        ),
        title: Text(
          label,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: emphasised ? FontWeight.w700 : FontWeight.w600,
            color: emphasised ? scheme.onPrimaryContainer : null,
          ),
        ),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

/// Error presentation. [onRetry] is omitted for a terminal failure, so the widget cannot
/// offer a retry that will not help.
class ErrorView extends StatelessWidget {
  const ErrorView({
    required this.message,
    this.onRetry,
    this.retryLabel,
    super.key,
  }) : assert(
         onRetry == null || retryLabel != null,
         'A retry button needs a localized label; there is no safe English default.',
       );

  final String message;
  final VoidCallback? onRetry;
  final String? retryLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(Insets.lg),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Icon(
            Icons.info_outline,
            size: 40,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: Insets.md),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          if (onRetry != null) ...<Widget>[
            const SizedBox(height: Insets.lg),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(retryLabel!),
            ),
          ],
        ],
      ),
    );
  }
}

/// Empty presentation for a list or a space with nothing in it yet.
///
/// An empty state has to teach the space: what belongs here and which action fills it.
/// A bare label is an omission, not a state, so [detail] and [action] are there to be
/// used whenever they can say something true.
class EmptyView extends StatelessWidget {
  const EmptyView({
    required this.icon,
    required this.title,
    this.detail,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? detail;

  /// The way out of the empty state, e.g. "Add item". Omitted only when no action can
  /// actually change anything.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final String? detailText = detail;
    final Widget? actionWidget = action;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Insets.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 40, color: scheme.onSurfaceVariant),
            const SizedBox(height: Insets.md),
            Text(title, textAlign: TextAlign.center, style: text.titleMedium),
            if (detailText != null) ...<Widget>[
              const SizedBox(height: Insets.sm),
              Text(
                detailText,
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
            if (actionWidget != null) ...<Widget>[
              const SizedBox(height: Insets.lg),
              actionWidget,
            ],
          ],
        ),
      ),
    );
  }
}

/// Marks a route that exists for navigation but has no implementation yet.
///
/// Deliberately plain and explicitly labelled. TASKS P2-05 requires that development
/// scaffolding can never be mistaken for a real scan result.
class NotImplementedView extends StatelessWidget {
  const NotImplementedView({
    required this.title,
    required this.detail,
    super.key,
  });

  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Insets.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(
              Icons.construction_outlined,
              size: 40,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: Insets.md),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: Insets.sm),
            Text(
              detail,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

/// Loading presentation for work that has a name.
///
/// The label is required and should name the actual work ("Analysing your photo"), the
/// same way [ErrorView] names the failure: a bare spinner tells the user nothing. The
/// visible label is excluded from semantics because the indicator already announces the
/// same words — without that, a screen reader would read the state twice.
class LoadingView extends StatelessWidget {
  const LoadingView({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Insets.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            SizedBox(
              width: 36,
              height: 36,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                semanticsLabel: label,
              ),
            ),
            const SizedBox(height: Insets.md),
            ExcludeSemantics(
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Marks a screen that is rendering development fixture data.
///
/// TASKS P2-05 requires that fixture output can never be mistaken for a real scan
/// result, so every journey screen that shows a fixture carries this banner. It is not
/// decorative: it stays until the real pipeline replaces the fixture.
class FixtureNotice extends StatelessWidget {
  const FixtureNotice({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      width: double.infinity,
      color: scheme.secondaryContainer,
      padding: const EdgeInsets.symmetric(
        horizontal: Insets.lg,
        vertical: Insets.sm + 2,
      ),
      child: Row(
        children: <Widget>[
          Icon(
            Icons.science_outlined,
            size: 20,
            color: scheme.onSecondaryContainer,
          ),
          const SizedBox(width: Insets.sm),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSecondaryContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
