import 'package:flutter/material.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../l10n/generated/app_localizations.dart';

/// Terms and disclaimer.
///
/// Required by PRD section 5.3 and screen 20 of section 33. It must stay reachable from
/// onboarding, from Settings, and from every report — a single first-run acceptance the
/// user cannot revisit is not sufficient.
class DisclaimerScreen extends StatelessWidget {
  const DisclaimerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.disclaimerTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Insets.lg),
          child: Text(
            l10n.disclaimerBody,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      ),
    );
  }
}
