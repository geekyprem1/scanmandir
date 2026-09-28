import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../core/network/http_transport.dart';
import '../../scan/application/scan_submission_controller.dart';
import '../../scan/data/scan_api.dart';

/// Reads the generated report for a scan.
///
/// A report that does not exist yet is not a failure: the server answers `available:
/// false` with the scan's status, the report is generated in seconds by the same worker
/// that analyzed the photo, and the read is repeated on the shared poll budget so the
/// screen lands on the report rather than asking the user to refresh something that is
/// already on its way. When that budget runs out the not-ready state stays on screen with
/// its refresh action — the scan is late, not broken, and an error would say the wrong
/// thing about it.
class ReportController extends Notifier<UiState<ScanReport>> {
  bool _disposed = false;

  @override
  UiState<ScanReport> build() {
    ref.onDispose(() => _disposed = true);
    return const UiLoading<ScanReport>();
  }

  Future<void> load({required String scanId}) => _read(scanId: scanId);

  Future<void> _read({required String scanId}) async {
    final ScanApi api = ref.read(scanApiProvider);
    final PollPolicy policy = ref.read(pollPolicyProvider);
    final PollDelay wait = ref.read(pollDelayProvider);

    for (int attempt = 0; ; attempt += 1) {
      try {
        final ScanReport report = await api.readReport(scanId: scanId);
        if (_disposed) return;
        _setState(UiContent<ScanReport>(report));
        if (report.available || attempt >= policy.maxPolls) return;
      } on TransportException catch (error) {
        _setState(errorStateFor<ScanReport>(error.failure));
        return;
      } on Object catch (error) {
        _setState(
          UiTerminalError<ScanReport>(
            Failure(kind: FailureKind.unknown, debugMessage: error.toString()),
          ),
        );
        return;
      }

      await wait(policy.delayFor(attempt));
      if (_disposed) return;
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
