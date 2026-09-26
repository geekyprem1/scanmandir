import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/designsystem/app_theme.dart';
import '../../../core/designsystem/app_widgets.dart';
import '../../../core/designsystem/failure_view.dart';
import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../application/detected_items_controller.dart';
import '../application/scan_submission_controller.dart';
import '../data/scan_api.dart';
import '../domain/scan_labels.dart';

/// What the model saw, and the user's chance to correct it (PRD screen 8, TASKS P5-05).
///
/// This is the screen the whole product's honesty rests on: the model's uncalibrated
/// confidence is never shown as a probability, "not identified" is a first-class answer
/// rather than a guess, a box is drawn only where the model actually localized something,
/// and what leaves this screen is the user's confirmed list — not the model's raw output.
class DetectedItemsScreen extends ConsumerStatefulWidget {
  const DetectedItemsScreen({super.key});

  @override
  ConsumerState<DetectedItemsScreen> createState() =>
      _DetectedItemsScreenState();
}

class _DetectedItemsScreenState extends ConsumerState<DetectedItemsScreen> {
  /// The aspect ratio of the photo, once known: the overlay can only line up if the image
  /// is drawn at its own proportions rather than letterboxed inside a box.
  double? _photoAspectRatio;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  void _start() {
    final String? scanId = ref
        .read(scanSubmissionControllerProvider)
        .valueOrNull
        ?.scanId;
    if (scanId != null) {
      unawaited(
        ref.read(detectedItemsControllerProvider.notifier).load(scanId: scanId),
      );
    }

    final Uint8List? photo = ref
        .read(scanSubmissionControllerProvider.notifier)
        .photo;
    if (photo != null) unawaited(_measure(photo));
  }

  Future<void> _measure(Uint8List bytes) async {
    try {
      final ui.Codec codec = await ui.instantiateImageCodec(bytes);
      final ui.FrameInfo frame = await codec.getNextFrame();
      if (!mounted) return;
      setState(() {
        _photoAspectRatio = frame.image.width / frame.image.height;
      });
      frame.image.dispose();
      codec.dispose();
    } on Object {
      // Without the ratio the overlay is simply not drawn; the list still works.
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final UiState<DetectedItemsState> state = ref.watch(
      detectedItemsControllerProvider,
    );
    final DetectedItemsController controller = ref.read(
      detectedItemsControllerProvider.notifier,
    );
    // Read rather than watched: the photo never changes while this screen is open, and the
    // overlay only needs it once.
    final Uint8List? photo = ref
        .read(scanSubmissionControllerProvider.notifier)
        .photo;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.detectedItemsTitle)),
      body: SafeArea(
        child: switch (state) {
          UiContent<DetectedItemsState>(value: final DetectedItemsState data) =>
            data.isConfirmed
                ? _Confirmed(scanId: data.scanId)
                : _Review(
                    data: data,
                    photo: photo,
                    aspectRatio: _photoAspectRatio,
                    onConfirm: controller.confirmItem,
                    onRemove: controller.removeItem,
                    onCorrect: controller.correctItem,
                    onAdd: controller.addItem,
                    onContinue: () => context.push('/scan/context'),
                  ),
          UiRecoverableError<DetectedItemsState>(
            failure: final Failure failure,
          ) =>
            FailureView(failure: failure, onRetry: () => _reload(controller)),
          UiTerminalError<DetectedItemsState>(failure: final Failure failure) =>
            FailureView(failure: failure),
          _ =>
            ref.read(scanSubmissionControllerProvider.notifier).hasStarted
                ? LoadingView(label: l10n.detectedItemsIntro)
                : EmptyView(
                    icon: Icons.photo_camera_outlined,
                    title: l10n.scanNothingTitle,
                    detail: l10n.scanNothingDetail,
                    action: FilledButton(
                      onPressed: () => context.go('/upload'),
                      child: Text(l10n.scanNothingAction),
                    ),
                  ),
        },
      ),
    );
  }

  void _reload(DetectedItemsController controller) {
    final String? scanId = ref
        .read(scanSubmissionControllerProvider)
        .valueOrNull
        ?.scanId;
    if (scanId != null) unawaited(controller.load(scanId: scanId));
  }
}

class _Confirmed extends StatelessWidget {
  const _Confirmed({required this.scanId});

  final String scanId;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Insets.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(
              Icons.check_circle,
              size: 40,
              color: Theme.of(context).colorScheme.tertiary,
            ),
            const SizedBox(height: Insets.md),
            Text(
              l10n.detectedConfirmedTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: Insets.sm),
            Text(
              l10n.detectedConfirmedDetail,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: Insets.lg),
            FilledButton(
              onPressed: () => context.go('/scan'),
              child: Text(l10n.actionContinue),
            ),
          ],
        ),
      ),
    );
  }
}

class _Review extends StatelessWidget {
  const _Review({
    required this.data,
    required this.photo,
    required this.aspectRatio,
    required this.onConfirm,
    required this.onRemove,
    required this.onCorrect,
    required this.onAdd,
    required this.onContinue,
  });

  final DetectedItemsState data;
  final Uint8List? photo;
  final double? aspectRatio;
  final void Function(String id) onConfirm;
  final void Function(String id) onRemove;
  final void Function(String id, String label) onCorrect;
  final void Function(String label) onAdd;

  /// The confirmation is sent from the context screen, so the objects and the answers
  /// commit together as one document (TASKS P5-07).
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Column(
      children: <Widget>[
        if (data.staleNotice)
          Container(
            width: double.infinity,
            color: scheme.secondaryContainer,
            padding: const EdgeInsets.symmetric(
              horizontal: Insets.lg,
              vertical: Insets.sm,
            ),
            child: Text(
              l10n.errorConflict,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSecondaryContainer,
              ),
            ),
          ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: Insets.sm),
            children: <Widget>[
              if (photo != null && aspectRatio != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Insets.md),
                  child: AspectRatio(
                    aspectRatio: aspectRatio!,
                    child: Stack(
                      fit: StackFit.expand,
                      children: <Widget>[
                        Image.memory(photo!, fit: BoxFit.fill),
                        CustomPaint(
                          painter: _BoxPainter(
                            items: data.items,
                            color: scheme.tertiary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  Insets.lg,
                  Insets.md,
                  Insets.lg,
                  Insets.sm,
                ),
                child: Text(
                  l10n.detectedItemsIntro,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ),
              if (data.items.isEmpty)
                EmptyView(
                  icon: Icons.playlist_add,
                  title: l10n.detectedItemsEmptyTitle,
                  detail: l10n.detectedItemsEmptyDetail,
                  action: TextButton.icon(
                    onPressed: () => _pickLabel(context, 'puja_object', onAdd),
                    icon: const Icon(Icons.add),
                    label: Text(l10n.detectedAddAction),
                  ),
                )
              else
                for (final ReviewItem item in data.items)
                  ListTile(
                    title: Text(labelDisplayName(l10n, item.label)),
                    subtitle: Text(
                      <String>[
                        representationDisplayName(
                          l10n,
                          item.representationType,
                        ),
                        if (item.box != null) l10n.detectedLocationMarked,
                      ].join(' · '),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        if (item.verificationRequired)
                          StatusChip(
                            label: l10n.detectedNeedsVerification,
                            tone: StatusTone.verify,
                          )
                        else if (item.action != ReviewAction.pending)
                          StatusChip(
                            label: l10n.detectedItemConfirmed,
                            tone: StatusTone.good,
                          ),
                        IconButton(
                          icon: const Icon(Icons.check_circle_outline),
                          tooltip: l10n.actionConfirm,
                          onPressed: () => onConfirm(item.id),
                        ),
                        IconButton(
                          icon: const Icon(Icons.edit_outlined),
                          tooltip: l10n.detectedCorrectTitle,
                          onPressed: () => _pickLabel(context, item.category, (
                            String label,
                          ) {
                            onCorrect(item.id, label);
                          }),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline),
                          tooltip: l10n.actionRemove,
                          onPressed: () => onRemove(item.id),
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
                  onPressed: () => _pickLabel(context, 'puja_object', onAdd),
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
            onPressed: onContinue,
            child: Text(l10n.actionContinue),
          ),
        ),
      ],
    );
  }

  /// A correction and an addition are the same decision: which catalog label is right.
  Future<void> _pickLabel(
    BuildContext context,
    String category,
    void Function(String label) chosen,
  ) async {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<String> labels = labelsForCategory(category);

    final String? label = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) => SimpleDialog(
        title: Text(l10n.detectedCorrectTitle),
        children: <Widget>[
          SizedBox(
            height: 320,
            width: 320,
            child: ListView(
              children: <Widget>[
                for (final String label in labels)
                  SimpleDialogOption(
                    onPressed: () => Navigator.of(dialogContext).pop(label),
                    child: Text(labelDisplayName(l10n, label)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );

    if (label != null) chosen(label);
  }
}

/// Draws a box for every item the model localized, and nothing for the rest.
class _BoxPainter extends CustomPainter {
  _BoxPainter({required this.items, required this.color});

  final List<ReviewItem> items;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = color;

    for (final ReviewItem item in items) {
      final BoundingBoxView? box = item.box;
      if (box == null) continue;
      canvas.drawRect(
        Rect.fromLTWH(
          box.x * size.width,
          box.y * size.height,
          box.width * size.width,
          box.height * size.height,
        ),
        stroke,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _BoxPainter oldDelegate) =>
      oldDelegate.items != items || oldDelegate.color != color;
}
