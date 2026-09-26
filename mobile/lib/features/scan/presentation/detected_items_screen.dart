import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../development/journey_fixture.dart';

/// Editable detected-items shell (PRD screen 8).
///
/// The confirmation affordances are the point of this screen: the user confirms what is
/// right, removes what is wrong, and adds what the detection missed (P5-05). Editing
/// happens against the fixture with local state only — nothing is sent anywhere, and
/// in-place correction arrives with the real data in Phase 5.
class DetectedItemsScreen extends StatefulWidget {
  const DetectedItemsScreen({super.key});

  @override
  State<DetectedItemsScreen> createState() => _DetectedItemsScreenState();
}

class _DetectedItemsScreenState extends State<DetectedItemsScreen> {
  final Set<String> _confirmed = <String>{};
  final Set<String> _removed = <String>{};
  final List<FixtureItem> _added = <FixtureItem>[];
  int _nextAddedId = 0;

  Future<void> _addItem() async {
    final AppLocalizations l10n = AppLocalizations.of(context);

    final String? name = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) {
        String value = '';
        return AlertDialog(
          title: Text(l10n.detectedAddTitle),
          content: TextField(
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.detectedAddFieldLabel),
            onChanged: (String text) => value = text,
            onSubmitted: (String text) => Navigator.of(dialogContext).pop(text),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(l10n.actionCancel),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(value),
              child: Text(l10n.actionAdd),
            ),
          ],
        );
      },
    );

    if (!mounted || name == null || name.trim().isEmpty) {
      return;
    }
    setState(() {
      _added.add(FixtureItem(id: 'added-${_nextAddedId++}', name: name.trim()));
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    // Fixture items keep their identity across rebuilds so a language change re-renders
    // the names without losing what the user confirmed or removed.
    final List<(FixtureItem, bool)> rows = <(FixtureItem, bool)>[
      for (final FixtureItem item in JourneyFixture.detectedItems(l10n))
        if (!_removed.contains(item.id)) (item, _confirmed.contains(item.id)),
      for (final FixtureItem item in _added) (item, true),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.detectedItemsTitle)),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            FixtureNotice(label: l10n.fixtureNotice),
            Expanded(
              // Removing every item is a real empty state, not a failure: it says what
              // belongs here and offers the one action that fills it (P2-06).
              child: rows.isEmpty
                  ? EmptyView(
                      icon: Icons.playlist_add,
                      title: l10n.detectedItemsEmptyTitle,
                      detail: l10n.detectedItemsEmptyDetail,
                      action: TextButton.icon(
                        onPressed: _addItem,
                        icon: const Icon(Icons.add),
                        label: Text(l10n.detectedAddAction),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.symmetric(vertical: Insets.sm),
                      children: <Widget>[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(
                            Insets.lg,
                            Insets.md,
                            Insets.lg,
                            Insets.sm,
                          ),
                          child: Text(
                            l10n.detectedItemsIntro,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ),
                        for (final (FixtureItem item, bool confirmed) in rows)
                          ListTile(
                            title: Text(item.name),
                            subtitle: item.kind == null
                                ? null
                                : Text(item.kind!),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: <Widget>[
                                if (confirmed)
                                  StatusChip(
                                    label: l10n.detectedItemConfirmed,
                                    tone: StatusTone.good,
                                  )
                                else
                                  IconButton(
                                    icon: const Icon(
                                      Icons.check_circle_outline,
                                    ),
                                    tooltip: l10n.actionConfirm,
                                    onPressed: () =>
                                        setState(() => _confirmed.add(item.id)),
                                  ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  tooltip: l10n.actionRemove,
                                  onPressed: () =>
                                      setState(() => _removed.add(item.id)),
                                ),
                              ],
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: Insets.lg,
                            vertical: Insets.md,
                          ),
                          child: TextButton.icon(
                            onPressed: _addItem,
                            icon: const Icon(Icons.add),
                            label: Text(l10n.detectedAddAction),
                          ),
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
              child: FilledButton(
                onPressed: () => context.push('/scan/context'),
                child: Text(l10n.actionContinue),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
