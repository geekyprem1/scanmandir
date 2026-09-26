/// Platform boundaries.
///
/// Implementations land in later phases. These interfaces exist now so that feature code
/// never imports a plugin type directly — swapping a package must not ripple into the
/// domain or the report models (ARCHITECTURE.md section 4).
library;

import 'dart:typed_data';

// ---------------------------------------------------------------------------
// Camera and gallery — Phase 4
// ---------------------------------------------------------------------------

/// A photo the user captured or picked, held as an app-private temporary file.
class CapturedPhoto {
  const CapturedPhoto({
    required this.path,
    required this.byteLength,
    required this.mimeType,
  });

  final String path;
  final int byteLength;
  final String mimeType;
}

enum PhotoSourceDenial {
  /// User declined the permission. Gallery upload must remain available.
  permissionDenied,

  /// Declined with "don't ask again"; only Settings can change it.
  permissionPermanentlyDenied,

  /// No camera on the device.
  unavailable,

  /// User backed out. Not an error.
  cancelled,
}

sealed class PhotoResult {
  const PhotoResult();
}

final class PhotoCaptured extends PhotoResult {
  const PhotoCaptured(this.photo);
  final CapturedPhoto photo;
}

final class PhotoRefused extends PhotoResult {
  const PhotoRefused(this.reason);
  final PhotoSourceDenial reason;
}

abstract interface class PhotoSource {
  /// Requests camera permission at the point of use, never at startup.
  Future<PhotoResult> capture();

  /// Picks a single image. Must request access to the chosen image only, not the
  /// whole library, wherever the platform supports that.
  Future<PhotoResult> pickFromGallery();
}

// ---------------------------------------------------------------------------
// Credential storage — Phase 3
// ---------------------------------------------------------------------------

/// Platform-backed secure storage.
///
/// Session tokens must never be written to the SQLite cache or to shared preferences
/// (ARCHITECTURE.md section 4).
abstract interface class SecureCredentialStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);

  /// Called on logout and on account deletion.
  Future<void> clear();
}

// ---------------------------------------------------------------------------
// Billing — Phase 10
// ---------------------------------------------------------------------------

/// Outcome of a store purchase attempt.
///
/// `pending` is a real Android state, not an edge case: some payment methods settle
/// later. It must never be treated as success. Entitlement is granted only after the
/// server verifies the purchase.
enum PurchaseOutcome {
  purchased,
  pending,
  cancelled,
  alreadyOwned,
  unavailable,
  failed,
}

class PurchaseReceipt {
  const PurchaseReceipt({required this.productId, required this.providerToken});

  final String productId;

  /// Opaque token sent to the backend for verification. The client never decides
  /// entitlement for itself.
  final String providerToken;
}

abstract interface class StoreBilling {
  Future<bool> isAvailable();
  Future<(PurchaseOutcome, PurchaseReceipt?)> purchase(String productId);

  /// Restores previously owned purchases so a reinstall or new device recovers access.
  Future<List<PurchaseReceipt>> restorePurchases();
}

// ---------------------------------------------------------------------------
// Background transfer — Phase 4
// ---------------------------------------------------------------------------

/// OS-scheduled upload.
///
/// A Dart timer or isolate does not keep running once the app is suspended, so upload
/// retry has to be handed to platform scheduling. Analysis itself runs on the server;
/// the app only needs to get the bytes there and then reconcile state on resume.
abstract interface class BackgroundTransfer {
  Future<bool> isSupported();

  /// Enqueues an upload that should survive the app being backgrounded.
  /// [taskId] must be stable so a retry cannot create a second transfer.
  Future<void> enqueueUpload({
    required String taskId,
    required Uri destination,
    required String filePath,
    required Map<String, String> headers,
  });

  Future<void> cancel(String taskId);
}

// ---------------------------------------------------------------------------
// Image preparation — Phase 4
// ---------------------------------------------------------------------------

/// Produces the normalized derivative the backend expects: oriented, size-bounded, and
/// stripped of unnecessary metadata such as GPS coordinates.
abstract interface class ImagePreparer {
  Future<Uint8List> prepareForUpload(
    String filePath, {
    required int maxEdgePixels,
  });
}
