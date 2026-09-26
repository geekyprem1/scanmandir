import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/model/failure.dart';
import '../../../core/model/ui_state.dart';
import '../../../core/network/http_transport.dart';
import '../data/scan_api.dart';

/// What the user has done with one detected object.
enum ReviewAction { pending, confirmed, corrected, added }

/// One row of the confirmation list, as the user is shaping it.
class ReviewItem {
  const ReviewItem({
    required this.id,
    required this.label,
    required this.category,
    required this.representationType,
    required this.verificationRequired,
    required this.action,
    this.memberLabels,
    this.box,
    this.modelConfidence,
    this.correctedFrom,
  });

  factory ReviewItem.fromObservation(ObservationView observation) {
    return ReviewItem(
      id: observation.id,
      label: observation.label,
      category: observation.category,
      representationType: observation.representationType,
      verificationRequired: observation.verificationRequired,
      action: ReviewAction.pending,
      memberLabels: observation.memberLabels,
      box: observation.boundingBox,
      modelConfidence: observation.modelConfidence,
    );
  }

  final String id;
  final String label;
  final String category;
  final String representationType;
  final bool verificationRequired;
  final ReviewAction action;
  final List<String>? memberLabels;

  /// Null when the model did not localize this object, which is why the overlay is skipped
  /// for it rather than drawn somewhere invented.
  final BoundingBoxView? box;
  final double? modelConfidence;
  final String? correctedFrom;

  ReviewItem withAction(ReviewAction next) => ReviewItem(
    id: id,
    label: label,
    category: category,
    representationType: representationType,
    verificationRequired: verificationRequired,
    action: next,
    memberLabels: memberLabels,
    box: box,
    modelConfidence: modelConfidence,
    correctedFrom: correctedFrom,
  );

  ReviewItem withLabel(String nextLabel, ReviewAction next) => ReviewItem(
    id: id,
    label: nextLabel,
    category: category,
    representationType: representationType,
    verificationRequired: verificationRequired,
    action: next,
    memberLabels: memberLabels,
    box: box,
    modelConfidence: modelConfidence,
    correctedFrom: action == ReviewAction.added ? null : label,
  );

  ConfirmedObjectInput toInput() => ConfirmedObjectInput(
    id: id,
    label: label,
    category: category,
    representationType: representationType,
    verificationRequired: verificationRequired,
    action: switch (action) {
      ReviewAction.added => 'added',
      ReviewAction.corrected => 'corrected',
      _ => 'confirmed',
    },
    groupId: null,
    memberLabels: memberLabels,
    boundingBox: box,
    modelConfidence: modelConfidence,
    correctedFrom: correctedFrom,
  );
}

class DetectedItemsState {
  const DetectedItemsState({
    required this.scanId,
    required this.imageRevision,
    required this.items,
    this.context = const <String, String>{},
    this.submitting = false,
    this.confirmedInputRevision,
    this.staleNotice = false,
  });

  final String scanId;
  final int imageRevision;
  final List<ReviewItem> items;

  /// Tradition and context answers, by question id. An unanswered question is absent
  /// rather than defaulted, so the report can say a tradition was not given (TASKS P5-06).
  final Map<String, String> context;
  final bool submitting;

  /// Set once the server accepted the confirmation.
  final int? confirmedInputRevision;

  /// Set when a confirmation was refused because the scan had moved on and the list was
  /// reloaded: the user is told why their edit did not go through.
  final bool staleNotice;

  bool get isConfirmed => confirmedInputRevision != null;

  DetectedItemsState copyWith({
    List<ReviewItem>? items,
    Map<String, String>? context,
    bool? submitting,
    int? confirmedInputRevision,
    bool? staleNotice,
  }) {
    return DetectedItemsState(
      scanId: scanId,
      imageRevision: imageRevision,
      items: items ?? this.items,
      context: context ?? this.context,
      submitting: submitting ?? this.submitting,
      confirmedInputRevision:
          confirmedInputRevision ?? this.confirmedInputRevision,
      staleNotice: staleNotice ?? this.staleNotice,
    );
  }
}

/// The confirmation flow (TASKS P5-05, P5-07).
///
/// The user's edits live here until they confirm, and the confirmation is sent as one
/// document: what the model saw, what the user kept, what they corrected and what they
/// added. That document — not the model's raw output — is what the report is built from.
class DetectedItemsController extends Notifier<UiState<DetectedItemsState>> {
  int _addedCounter = 0;
  bool _disposed = false;

  @override
  UiState<DetectedItemsState> build() {
    ref.onDispose(() => _disposed = true);
    return const UiLoading<DetectedItemsState>();
  }

  /// Reads what the model saw for this scan.
  Future<void> load({required String scanId, bool silent = false}) async {
    if (!silent) _setState(const UiLoading<DetectedItemsState>());
    final ScanApi api = ref.read(scanApiProvider);
    try {
      final ScanObservations observations = await api.readObservations(
        scanId: scanId,
      );
      _setState(
        UiContent<DetectedItemsState>(
          DetectedItemsState(
            scanId: observations.scanId,
            imageRevision: observations.imageRevision,
            items: observations.observations
                .map(ReviewItem.fromObservation)
                .toList(),
            staleNotice: silent,
          ),
        ),
      );
    } on TransportException catch (error) {
      _setState(errorStateFor<DetectedItemsState>(error.failure));
    } on Object catch (error) {
      _setState(
        UiTerminalError<DetectedItemsState>(
          Failure(kind: FailureKind.unknown, debugMessage: error.toString()),
        ),
      );
    }
  }

  void confirmItem(String id) => _mapItems((item) {
    if (item.id != id) return item;
    return item.withAction(
      item.action == ReviewAction.corrected
          ? item.action
          : ReviewAction.confirmed,
    );
  });

  void removeItem(String id) =>
      _mapItems((item) => item.id == id ? null : item);

  void correctItem(String id, String label) => _mapItems((item) {
    if (item.id != id) return item;
    return item.withLabel(label, ReviewAction.corrected);
  });

  void addItem(String label) {
    final DetectedItemsState? current = state.valueOrNull;
    if (current == null) return;
    _addedCounter += 1;
    final ReviewItem added = ReviewItem(
      id: 'user-$_addedCounter',
      label: label,
      category: label == 'unknown_idol' || _deityLabels.contains(label)
          ? 'deity_representation'
          : 'puja_object',
      representationType: 'physical_object',
      verificationRequired: true,
      action: ReviewAction.added,
    );
    _setState(
      UiContent<DetectedItemsState>(
        current.copyWith(items: <ReviewItem>[...current.items, added]),
      ),
    );
  }

  /// Records one tradition or context answer. Questions can be skipped, and a skipped
  /// question stays out of the map rather than becoming a default.
  void answer(String question, String value) {
    final DetectedItemsState? current = state.valueOrNull;
    if (current == null || current.isConfirmed) return;
    _setState(
      UiContent<DetectedItemsState>(
        current.copyWith(
          context: <String, String>{...current.context, question: value},
        ),
      ),
    );
  }

  /// Sends the confirmation. Its result is the input every later stage reads.
  Future<void> submit() async {
    final DetectedItemsState? current = state.valueOrNull;
    if (current == null || current.submitting) return;

    _setState(
      UiContent<DetectedItemsState>(current.copyWith(submitting: true)),
    );
    final ScanApi api = ref.read(scanApiProvider);
    try {
      final ConfirmationResult result = await api.confirm(
        scanId: current.scanId,
        expectedImageRevision: current.imageRevision,
        // Everything on the list goes, including what the user left alone: an object they
        // did not touch is one they accepted, and the report is built from this document.
        objects: current.items
            .map((ReviewItem item) => item.toInput())
            .toList(),
        context: current.context,
      );
      if (_disposed) return;
      final DetectedItemsState latest = state.valueOrNull ?? current;
      _setState(
        UiContent<DetectedItemsState>(
          latest.copyWith(
            submitting: false,
            confirmedInputRevision: result.inputRevision,
          ),
        ),
      );
    } on TransportException catch (error) {
      if (_disposed) return;
      // A confirmation written against an older photo is refused rather than trusted. The
      // list is reloaded so the user is looking at what the server actually has.
      if (error.failure.code == 'REVISION_CONFLICT') {
        await load(scanId: current.scanId, silent: true);
        return;
      }
      _setState(errorStateFor<DetectedItemsState>(error.failure));
    }
  }

  void _mapItems(ReviewItem? Function(ReviewItem item) update) {
    final DetectedItemsState? current = state.valueOrNull;
    if (current == null || current.isConfirmed) return;
    final List<ReviewItem> next = <ReviewItem>[];
    for (final ReviewItem item in current.items) {
      final ReviewItem? updated = update(item);
      if (updated != null) next.add(updated);
    }
    _setState(UiContent<DetectedItemsState>(current.copyWith(items: next)));
  }

  void _setState(UiState<DetectedItemsState> next) {
    if (_disposed) return;
    state = next;
  }
}

/// Mirrors the deity half of the catalog for the one decision the client makes locally:
/// whether something the user added is a deity or a puja object.
const Set<String> _deityLabels = <String>{
  'ganesh',
  'shiva',
  'shivling',
  'hanuman',
  'krishna',
  'radha_krishna',
  'ram',
  'sita',
  'lakshman',
  'ram_darbar',
  'lakshmi',
  'saraswati',
  'durga',
  'kali',
  'parvati',
  'kartikeya',
  'vishnu',
  'narasimha',
  'shani',
  'surya',
  'navagraha',
  'other_deity',
  'unknown_idol',
};

final NotifierProvider<DetectedItemsController, UiState<DetectedItemsState>>
detectedItemsControllerProvider =
    NotifierProvider<DetectedItemsController, UiState<DetectedItemsState>>(
      DetectedItemsController.new,
    );
