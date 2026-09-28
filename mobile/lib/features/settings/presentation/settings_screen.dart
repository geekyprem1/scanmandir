import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_service.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/environment.dart';
import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../application/backend_health_controller.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Locale locale = ref.watch(localeControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: SafeArea(
        child: ListView(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Insets.lg,
                Insets.lg,
                Insets.lg,
                Insets.sm,
              ),
              child: Text(
                l10n.settingsLanguage,
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            RadioGroup<Locale>(
              groupValue: locale,
              onChanged: (Locale? value) => _select(ref, value),
              child: Column(
                children: <Widget>[
                  RadioListTile<Locale>(
                    value: const Locale('en'),
                    title: Text(l10n.settingsLanguageEnglish),
                  ),
                  RadioListTile<Locale>(
                    value: const Locale('hi'),
                    title: Text(l10n.settingsLanguageHindi),
                  ),
                ],
              ),
            ),
            const Divider(height: Insets.xl),
            ListTile(
              leading: const Icon(Icons.gavel_outlined),
              title: Text(l10n.disclaimerTitle),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/disclaimer'),
            ),
            const Divider(height: Insets.xl),
            const _SessionTile(),
            const Divider(height: Insets.xl),
            const _BackendStatusTile(),
          ],
        ),
      ),
    );
  }

  Future<void> _select(WidgetRef ref, Locale? value) async {
    if (value != null) {
      await ref.read(localeControllerProvider.notifier).select(value);
    }
  }
}

/// The user's identity state.
///
/// A guest session is created on demand for the first scan (PRD section 7), so this
/// tile is also the place to start one before scanning exists. The guest notice is the
/// PRD's requirement that losing the session can mean losing history.
class _SessionTile extends ConsumerWidget {
  const _SessionTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final SessionUiState state = ref.watch(sessionControllerProvider);

    void startSession() =>
        ref.read(sessionControllerProvider.notifier).startGuestSession();

    final Widget trailing = switch (state) {
      SessionSignedOut() => TextButton(
        onPressed: startSession,
        child: Text(l10n.sessionStartAction),
      ),
      SessionStarting() => SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          semanticsLabel: l10n.sessionStarting,
        ),
      ),
      SessionSignedIn(:final SessionIdentity identity) => StatusChip(
        label: identity.isAnonymous ? l10n.sessionGuest : l10n.sessionSignedIn,
        tone: StatusTone.good,
      ),
      SessionFailed() => TextButton(
        onPressed: startSession,
        child: Text(l10n.actionRetry),
      ),
    };

    final String subtitle = switch (state) {
      SessionSignedOut() => l10n.sessionSignedOut,
      SessionStarting() => l10n.sessionStarting,
      SessionSignedIn(:final SessionIdentity identity) => <String>[
        l10n.sessionGuestNotice,
        // Diagnostic only, as with the backend tile; the id is not user-facing copy.
        identity.userId,
      ].join('\n'),
      SessionFailed(:final Failure failure) => FailureView.messageFor(
        l10n,
        failure.kind,
      ),
    };

    return ListTile(
      leading: const Icon(Icons.person_outline),
      title: Text(l10n.settingsSession),
      subtitle: Text(subtitle),
      isThreeLine: state is SessionSignedIn,
      trailing: trailing,
    );
  }
}

/// Developer-facing connectivity check. It is also the one place in the app today that
/// renders all four controller states, which is what makes the wiring verifiable.
class _BackendStatusTile extends ConsumerWidget {
  const _BackendStatusTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final UiState<BackendHealth> state = ref.watch(backendHealthProvider);
    final Environment environment = ref.watch(environmentProvider);

    final Widget trailing = switch (state) {
      UiLoading<BackendHealth>() => StatusChip(
        label: l10n.statusChecking,
        tone: StatusTone.neutral,
      ),
      UiContent<BackendHealth>(:final BackendHealth value) => StatusChip(
        label: value.ready ? l10n.statusReachable : l10n.statusUnreachable,
        tone: value.ready ? StatusTone.good : StatusTone.review,
      ),
      UiRecoverableError<BackendHealth>() => TextButton(
        onPressed: () => ref.read(backendHealthProvider.notifier).refresh(),
        child: Text(l10n.actionRetry),
      ),
      UiTerminalError<BackendHealth>() => StatusChip(
        label: l10n.statusUnreachable,
        tone: StatusTone.verify,
      ),
    };

    final Failure? failure = state.failureOrNull;
    final BackendHealth? health = state.valueOrNull;

    return ListTile(
      leading: const Icon(Icons.cloud_outlined),
      title: Text(l10n.settingsBackendStatus),
      subtitle: Text(
        <String>[
          environment.apiBaseUrl.toString(),
          if (health != null && health.checks.isNotEmpty)
            health.checks.entries
                .map((MapEntry<String, String> e) => '${e.key}: ${e.value}')
                .join(', '),
          // Diagnostic only; user-facing copy would come from localization.
          if (failure != null) failure.toString(),
        ].join('\n'),
      ),
      isThreeLine: failure != null || (health?.checks.isNotEmpty ?? false),
      trailing: trailing,
    );
  }
}
