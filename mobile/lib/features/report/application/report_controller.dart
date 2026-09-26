import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../core/network/http_transport.dart';
import '../../scan/data/scan_api.dart';

/// Reads the generated report for a scan.
///
/// A report that does not exist yet is not a failure: the server answers `available:
/// false` with the scan's status, and the screen explains that rather than showing an
/// error for a scan that is simply still being processed.
class ReportController extends Notifier<UiState<ScanReport>> {
  bool _disposed = false;

  @override
  UiState<ScanReport> build() {
    ref.onDispose(() => _disposed = true);
    return const UiLoading<ScanReport>();
  }

  Future<void> load({required String scanId}) async {
    final ScanApi api = ref.read(scanApiProvider);
    try {
      final ScanReport report = await api.readReport(scanId: scanId);
      _setState(UiContent<ScanReport>(report));
    } on TransportException catch (error) {
      _setState(errorStateFor<ScanReport>(error.failure));
    } on Object catch (error) {
      _setState(
        UiTerminalError<ScanReport>(
          Failure(kind: FailureKind.unknown, debugMessage: error.toString()),
        ),
      );
    }
  }

  void _setState(UiState<ScanReport> next) {
    if (_disposed) return;
    state = next;
  }
}

final NotifierProvider<ReportController, UiState<ScanReport>>
reportControllerProvider =
    NotifierProvider<ReportController, UiState<ScanReport>>(
      ReportController.new,
    );
