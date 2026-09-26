import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../core/model/uuid.dart';
import '../../../core/network/http_transport.dart';
import '../data/scan_api.dart';

/// How long to wait between status polls (TASKS P4-08).
///
/// Polling is bounded twice over: the delay grows until it is capped, and the number of
/// polls is limited. A backend that never answers therefore costs a known, small number
/// of requests instead of an unbounded background loop.
class PollPolicy {
  const PollPolicy({
    this.firstDelay = const Duration(seconds: 2),
    this.factor = 1.5,
    this.maxDelay = const Duration(seconds: 10),
    this.maxPolls = 40,
  });

  final Duration firstDelay;
  final double factor;
  final Duration maxDelay;
  final int maxPolls;

  /// The delay before poll number [attempt], counting from zero.
  Duration delayFor(int attempt) {
    final double grown =
        firstDelay.inMilliseconds * pow(factor, attempt).toDouble();
    final double capped = grown.clamp(
      firstDelay.inMilliseconds.toDouble(),
      maxDelay.inMilliseconds.toDouble(),
    );
    return Duration(milliseconds: capped.round());
  }
}

/// Waiting, as a seam: tests replace this rather than waiting on real time.
typedef PollDelay = Future<void> Function(Duration duration);

final Provider<PollDelay> pollDelayProvider = Provider<PollDelay>(
  (Ref ref) => Future<void>.delayed,
);

final Provider<PollPolicy> pollPolicyProvider = Provider<PollPolicy>(
  (Ref ref) => const PollPolicy(),
);

/// The stages a user sees while their photo is being handled (PRD section 34).
///
/// Named stages, never a fabricated percentage: the server does not report progress, so
/// the app does not invent one.
enum ScanStage { uploading, analyzing, preparingReport, readyForConfirmation }

class ScanSubmission {
  const ScanSubmission({
    required this.scanId,
    required this.stage,
    this.snapshot,
  });

  final String scanId;
  final ScanStage stage;

  /// The server's own view of the scan; null until creation has answered.
  final ScanSnapshot? snapshot;
}

/// Runs the scan lifecycle from the app's side: create, upload, complete, then follow the
/// scan until the server stops moving it.
///
/// The photo is remembered for the life of the submission, because a retry after a
/// failed upload must not ask the user to pick it again. The creation idempotency key is
/// remembered with it, so a retry that re-reaches a create which already succeeded
/// replays the same scan instead of reserving allowance twice (ARCHITECTURE.md section 6).
class ScanSubmissionController extends Notifier<UiState<ScanSubmission>> {
  Uint8List? _photo;
  String _contentType = 'image/jpeg';
  String? _idempotencyKey;
  ScanSnapshot? _latest;
  bool _uploaded = false;
  bool _disposed = false;

  @override
  UiState<ScanSubmission> build() {
    ref.onDispose(() => _disposed = true);
    return const UiLoading<ScanSubmission>();
  }

  /// Uploads one photo and follows its scan.
  Future<void> submit({
    required Uint8List photo,
    String contentType = 'image/jpeg',
  }) {
    _photo = photo;
    _contentType = contentType;
    _idempotencyKey = newUuidV4();
    _latest = null;
    _uploaded = false;
    return _attempt();
  }

  /// Retries whatever failed.
  ///
  /// Once the upload has been verified this only resumes polling — no second upload and
  /// no second reservation (TASKS P4-07). Before that the upload is redone under the same
  /// idempotency key, so a creation that did reach the server is replayed rather than
  /// duplicated.
  Future<void> retry() {
    final ScanSnapshot? latest = _latest;
    return _uploaded && latest != null ? _follow(latest) : _attempt();
  }

  Future<void> _attempt() async {
    final Uint8List? photo = _photo;
    final String? idempotencyKey = _idempotencyKey;
    if (photo == null || idempotencyKey == null) {
      _setState(
        const UiTerminalError<ScanSubmission>(
          Failure(kind: FailureKind.unknown, code: 'NOTHING_TO_RETRY'),
        ),
      );
      return;
    }

    final ScanApi api = ref.read(scanApiProvider);
    _setState(const UiLoading<ScanSubmission>());

    try {
      final ScanSnapshot created = await api.create(
        idempotencyKey: idempotencyKey,
      );
      if (_disposed) return;
      _latest = created;
      _setState(
        UiContent<ScanSubmission>(
          ScanSubmission(
            scanId: created.id,
            stage: ScanStage.uploading,
            snapshot: created,
          ),
        ),
      );

      final UploadTicket ticket = await api.requestUploadUrl(
        scanId: created.id,
        contentType: _contentType,
      );
      await api.uploadOriginal(
        uploadUrl: ticket.uploadUrl,
        bytes: photo,
        headers: ticket.requiredHeaders,
      );
      if (_disposed) return;

      final ScanSnapshot verified = await api.completeUpload(
        scanId: created.id,
        stagingKey: ticket.stagingKey,
      );
      if (_disposed) return;
      _latest = verified;
      _uploaded = true;

      await _follow(verified);
    } on TransportException catch (error) {
      _setState(errorStateFor<ScanSubmission>(error.failure));
    } on Object catch (error) {
      _setState(
        UiTerminalError<ScanSubmission>(
          Failure(kind: FailureKind.unknown, debugMessage: error.toString()),
        ),
      );
    }
  }

  /// Follows a scan that has already been uploaded.
  Future<void> _follow(ScanSnapshot known) async {
    final ScanApi api = ref.read(scanApiProvider);
    final PollPolicy policy = ref.read(pollPolicyProvider);
    final PollDelay wait = ref.read(pollDelayProvider);

    ScanSnapshot snapshot = known;
    for (int attempt = 0; ; attempt += 1) {
      if (snapshot.status.isTerminal) {
        _setState(_finished(snapshot));
        return;
      }

      if (attempt >= policy.maxPolls) {
        // Bounded on purpose: the app stops asking rather than polling forever, and the
        // retry that resumes here is offered to the user.
        _setState(
          UiRecoverableError<ScanSubmission>(
            Failure(
              kind: FailureKind.timeout,
              code: 'POLL_TIMEOUT',
              debugMessage: 'stopped after ${policy.maxPolls} polls',
            ),
          ),
        );
        return;
      }

      _setState(
        UiContent<ScanSubmission>(
          ScanSubmission(
            scanId: snapshot.id,
            stage: _stageFor(snapshot.status),
            snapshot: snapshot,
          ),
        ),
      );

      await wait(policy.delayFor(attempt));
      if (_disposed) return;

      try {
        snapshot = await api.read(scanId: snapshot.id);
      } on TransportException catch (error) {
        // A poll that fails is not a failed scan: the upload is already safe on the
        // server, so this stays recoverable and the retry resumes polling.
        _setState(errorStateFor<ScanSubmission>(error.failure));
        return;
      }
      if (_disposed) return;
      _latest = snapshot;
    }
  }

  UiState<ScanSubmission> _finished(ScanSnapshot snapshot) {
    return switch (snapshot.status) {
      ScanStatus.needsRetake => const UiTerminalError<ScanSubmission>(
        Failure(kind: FailureKind.imageUnusable, code: 'IMAGE_UNUSABLE'),
      ),
      ScanStatus.deleted => const UiTerminalError<ScanSubmission>(
        Failure(kind: FailureKind.notFound, code: 'RESOURCE_DELETED'),
      ),
      ScanStatus.failed => UiRecoverableError<ScanSubmission>(
        Failure(
          kind: FailureKind.server,
          code: 'SCAN_FAILED',
          debugMessage: snapshot.failedStage,
        ),
      ),
      _ => UiContent<ScanSubmission>(
        ScanSubmission(
          scanId: snapshot.id,
          stage: ScanStage.readyForConfirmation,
          snapshot: snapshot,
        ),
      ),
    };
  }

  ScanStage _stageFor(ScanStatus status) {
    return switch (status) {
      ScanStatus.awaitingUpload => ScanStage.uploading,
      ScanStatus.generatingReport => ScanStage.preparingReport,
      ScanStatus.awaitingConfirmation ||
      ScanStatus.completed => ScanStage.readyForConfirmation,
      _ => ScanStage.analyzing,
    };
  }

  /// Writes state only while the controller is alive. An in-flight submission can outlive
  /// the screen that started it, and a late answer must not throw instead of being dropped.
  void _setState(UiState<ScanSubmission> next) {
    if (_disposed) return;
    state = next;
  }
}

final NotifierProvider<ScanSubmissionController, UiState<ScanSubmission>>
scanSubmissionControllerProvider =
    NotifierProvider<ScanSubmissionController, UiState<ScanSubmission>>(
      ScanSubmissionController.new,
    );
