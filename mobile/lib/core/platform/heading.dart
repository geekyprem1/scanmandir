/// Device heading capture.
///
/// Implementations arrive in Phase 9. The interface exists now because the distinctions
/// it encodes are design decisions from ARCHITECTURE.md section 8, not plugin details,
/// and features must never see a raw sensor value.
library;

/// Which direction a reading describes.
///
/// A compass reading measures where the *phone* points. It cannot establish which way an
/// idol faces, and it certainly cannot establish where the mandir sits inside the home.
/// Those are separate user inputs. Keeping the kind on every measurement is what stops
/// one being silently substituted for another.
enum HeadingMeasurementKind {
  /// The direction the worshipper faces while worshipping.
  worshipperFacing,
}

/// How reliable a reading is. A number alone is not an answer.
enum HeadingAccuracy {
  /// Usable.
  good,

  /// Readable but likely affected by nearby metal or magnets. Warn before accepting.
  unreliable,

  /// Sensor needs figure-of-eight calibration before it can be trusted.
  needsCalibration,
}

/// Why no reading is available.
enum HeadingUnavailableReason {
  /// No magnetometer on this device.
  noSensor,

  /// Permission or platform restriction.
  notPermitted,

  /// Sensor present but returning nothing usable.
  sensorFailure,
}

sealed class HeadingReading {
  const HeadingReading();
}

final class HeadingAvailable extends HeadingReading {
  const HeadingAvailable({
    required this.kind,
    required this.degrees,
    required this.accuracy,
  });

  final HeadingMeasurementKind kind;

  /// Degrees clockwise from north, 0 to 360.
  final double degrees;

  final HeadingAccuracy accuracy;
}

final class HeadingUnavailable extends HeadingReading {
  const HeadingUnavailable(this.reason);
  final HeadingUnavailableReason reason;
}

/// Every consumer must handle [HeadingUnavailable]. Manual cardinal entry and skipping
/// are always available paths, and a missing reading must leave the visual report
/// usable rather than blocking it.
abstract interface class HeadingSource {
  /// Whether this device can measure heading at all. Cheap to call.
  Future<bool> isSupported();

  /// Continuous readings while a capture screen is visible.
  Stream<HeadingReading> watch();
}
