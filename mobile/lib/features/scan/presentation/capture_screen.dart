import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/platform/media_picker.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../application/scan_submission_controller.dart';

/// Where a scan starts.
///
/// The system camera and the system gallery picker are offered side by side, so a user
/// who refuses the camera still has the gallery one tap away (TASKS P4-02). Nothing is
/// uploaded until a photo actually comes back, and cancelling says nothing: it is not a
/// failure.
class CaptureScreen extends ConsumerStatefulWidget {
  const CaptureScreen({super.key});

  @override
  ConsumerState<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends ConsumerState<CaptureScreen> {
  bool _picking = false;
  PickFailureKind? _failure;

  Future<void> _pick(
    Future<PickedPhoto?> Function(MediaPicker picker) pick,
  ) async {
    if (_picking) return;
    setState(() {
      _picking = true;
      _failure = null;
    });

    try {
      final PickedPhoto? photo = await pick(ref.read(mediaPickerProvider));
      if (!mounted) return;

      if (photo == null) {
        setState(() => _picking = false);
        return;
      }

      // Deliberately not awaited: the submission carries on while the user watches the
      // progress screen, and its state is what that screen renders. Submission never
      // throws — every outcome becomes state — so there is nothing to catch here.
      unawaited(
        ref
            .read(scanSubmissionControllerProvider.notifier)
            .submit(photo: photo.bytes, contentType: photo.contentType),
      );
      context.go('/scan');
    } on MediaPickerException catch (error) {
      if (!mounted) return;
      setState(() {
        _picking = false;
        _failure = error.kind;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final PickFailureKind? failure = _failure;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.captureTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Insets.md),
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: Insets.xs,
                vertical: Insets.md,
              ),
              child: Text(
                l10n.captureIntro,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
            ActionCard(
              label: l10n.captureFromCamera,
              icon: Icons.photo_camera_outlined,
              emphasised: true,
              onTap: _picking
                  ? null
                  : () => _pick(
                      (MediaPicker picker) => picker.captureFromCamera(),
                    ),
            ),
            const SizedBox(height: Insets.sm),
            ActionCard(
              label: l10n.captureFromGallery,
              icon: Icons.photo_library_outlined,
              onTap: _picking
                  ? null
                  : () =>
                        _pick((MediaPicker picker) => picker.pickFromGallery()),
            ),
            if (_picking)
              const Padding(
                padding: EdgeInsets.only(top: Insets.lg),
                child: LinearProgressIndicator(),
              ),
            if (failure != null) ErrorView(message: _messageFor(l10n, failure)),
          ],
        ),
      ),
    );
  }

  String _messageFor(AppLocalizations l10n, PickFailureKind kind) {
    return switch (kind) {
      PickFailureKind.permissionDenied => l10n.capturePermissionDenied,
      PickFailureKind.unavailable => l10n.captureUnavailable,
      PickFailureKind.failed => l10n.captureFailed,
    };
  }
}
