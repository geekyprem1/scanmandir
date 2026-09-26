import 'dart:typed_data';

import 'package:scan_my_mandir/core/platform/media_picker.dart';

/// A picker that answers with whatever the test decided.
///
/// Cancelling, a refused permission and a real photo are all one field apart, which is
/// what lets the capture screen be tested without a camera.
class FakeMediaPicker implements MediaPicker {
  FakeMediaPicker({
    this.photo,
    this.cameraFailure,
    this.galleryFailure,
    this.unavailable = false,
  });

  /// What a successful pick returns. Null models the user backing out.
  final PickedPhoto? photo;

  /// When set, the camera path throws it.
  final MediaPickerException? cameraFailure;

  /// When set, the gallery path throws it.
  final MediaPickerException? galleryFailure;

  /// Whether this device has a camera at all.
  final bool unavailable;

  int cameraCalls = 0;
  int galleryCalls = 0;

  @override
  Future<PickedPhoto?> captureFromCamera() async {
    cameraCalls++;
    if (unavailable) {
      throw const MediaPickerException(PickFailureKind.unavailable);
    }
    final MediaPickerException? failure = cameraFailure;
    if (failure != null) throw failure;
    return photo;
  }

  @override
  Future<PickedPhoto?> pickFromGallery() async {
    galleryCalls++;
    if (unavailable) {
      throw const MediaPickerException(PickFailureKind.unavailable);
    }
    final MediaPickerException? failure = galleryFailure;
    if (failure != null) throw failure;
    return photo;
  }
}

/// A small stand-in photo. The bytes never reach a decoder in these tests.
PickedPhoto samplePickedPhoto({
  String contentType = 'image/jpeg',
  String name = 'mandir.jpg',
}) {
  return PickedPhoto(
    bytes: Uint8List.fromList(<int>[137, 80, 78, 71, 13, 10, 26, 10]),
    contentType: contentType,
    name: name,
  );
}
