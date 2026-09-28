import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/session_controller.dart';
import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../core/network/http_transport.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../scan/data/scan_api.dart';

/// Saved reports are read from the owner's account, newest first. Photos are not listed.
class ReportHistoryScreen extends ConsumerStatefulWidget {
  const ReportHistoryScreen({super.key});

  @override
  ConsumerState<ReportHistoryScreen> createState() =>
      _ReportHistoryScreenState();
}

class _ReportHistoryScreenState extends ConsumerState<ReportHistoryScreen> {
  final List<ReportHistoryEntry> _items = <ReportHistoryEntry>[];
  String? _cursor;
  bool _loading = true;
  Failure? _failure;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(authServiceProvider).currentSession == null) {
        setState(() => _loading = false);
      } else {
        _load(reset: true);
      }
    });
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _items.clear();
        _cursor = null;
        _loading = true;
        _failure = null;
      });
    } else if (_loading) {
      return;
    } else {
      setState(() => _loading = true);
    }

    try {
      final ReportHistoryPage page = await ref
          .read(scanApiProvider)
          .listReports(cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _loading = false;
        _failure = null;
      });
    } on TransportException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failure = error.failure;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failure = Failure(
          kind: FailureKind.unknown,
          debugMessage: error.toString(),
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool hasSession =
        ref.watch(authServiceProvider).currentSession != null;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeReportsAction)),
      body: SafeArea(
        child: !hasSession || (_items.isEmpty && !_loading && _failure == null)
            ? EmptyView(
                icon: Icons.description_outlined,
                title: l10n.reportsEmptyTitle,
                detail: l10n.reportsEmptyDetail,
                action: FilledButton(
                  onPressed: () => context.go('/upload'),
                  child: Text(l10n.homeScanAction),
                ),
              )
            : _items.isEmpty && _failure != null
            ? FailureView(failure: _failure!, onRetry: () => _load(reset: true))
            : _items.isEmpty && _loading
            ? LoadingView(label: l10n.homeReportsAction)
            : ListView(
                padding: const EdgeInsets.all(Insets.md),
                children: <Widget>[
                  for (final ReportHistoryEntry item in _items)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.description_outlined),
                        title: Text(
                          MaterialLocalizations.of(
                            context,
                          ).formatMediumDate(item.createdAt.toLocal()),
                        ),
                        subtitle: Text(l10n.reportsItemCount(item.itemCount)),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push('/reports/${item.scanId}'),
                      ),
                    ),
                  if (_failure != null)
                    FailureView(failure: _failure!, onRetry: _load),
                  if (_cursor != null && _failure == null)
                    Center(
                      child: TextButton(
                        onPressed: _loading ? null : _load,
                        child: Text(l10n.reportsLoadMore),
                      ),
                    ),
                  if (_loading) LoadingView(label: l10n.homeReportsAction),
                ],
              ),
      ),
    );
  }
}
