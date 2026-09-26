import 'dart:typed_data';

import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

/// A photo the user chose, in the form the upload needs it.
class PickedPhoto {
  const PickedPhoto({
    required this.bytes,
    required this.contentType,
    required this.name,
  });

  final Uint8List bytes;

  /// A content type the server allows. Anything else is refused before upload rather
  /// than after: the server only signs jpeg, png and webp.
  final String contentType;
  final String name;

  int get byteCount => bytes.length;
}

/// Why a pick did not produce a photo.
///
/// Cancelling is not a failure and is not modelled here: that is a null result, because
/// nothing went wrong and nothing needs saying.
enum PickFailureKind {
  /// The user refused the permission the system asked for.
  permissionDenied,

  /// There is no camera or picker on this device.
  unavailable,

  /// The picker itself failed.
  failed,
}

class MediaPickerException implements Exception {
  const MediaPickerException(this.kind);

  final PickFailureKind kind;

  @override
  String toString() => 'MediaPickerException(${kind.name})';
}

/// Photo capture and import.
///
/// A platform interface, not a plugin call: feature code asks for a photo and gets bytes,
/// so screens and controllers stay testable without platform channels and stay free of
/// plugin types (ARCHITECTURE.md section 4).
abstract interface class MediaPicker {
  /// The system camera, when there is one.
  Future<PickedPhoto?> captureFromCamera();

  /// The system gallery picker.
  Future<PickedPhoto?> pickFromGallery();
}

/// The content types the server signs uploads for. Kept here so an unsupported choice is
/// refused on the device rather than by a round trip.
const Set<String> supportedPhotoContentTypes = <String>{
  'image/jpeg',
  'image/png',
  'image/webp',
};

class SystemMediaPicker implements MediaPicker {
  SystemMediaPicker({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<PickedPhoto?> captureFromCamera() => _pick(ImageSource.camera);

  @override
  Future<PickedPhoto?> pickFromGallery() => _pick(ImageSource.gallery);

  Future<PickedPhoto?> _pick(ImageSource source) async {
    final XFile? file;
    try {
      file = await _picker.pickImage(source: source, imageQuality: 90);
    } on PlatformException catch (error) {
      // A refused permission arrives here, and the code is the only reliable signal:
      // the plugin reports it as a platform error rather than a typed failure.
      if (error.code == 'camera_access_denied' ||
          error.code == 'photo_access_denied') {
        throw const MediaPickerException(PickFailureKind.permissionDenied);
      }
      throw const MediaPickerException(PickFailureKind.failed);
    }

    if (file == null) return null;

    final Uint8List bytes = await file.readAsBytes();
    final String contentType = _contentTypeOf(file);
    if (!supportedPhotoContentTypes.contains(contentType)) {
      // Better said here than after a failed upload.
      throw const MediaPickerException(PickFailureKind.failed);
    }

    return PickedPhoto(bytes: bytes, contentType: contentType, name: file.name);
  }

  /// The plugin reports a mime type on some platforms and nothing on others, so the
  /// extension is the fallback.
  String _contentTypeOf(XFile file) {
    final String? mime = file.mimeType;
    if (mime != null && mime.isNotEmpty) return mime.toLowerCase();

    final String name = file.name.toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}

final Provider<MediaPicker> mediaPickerProvider = Provider<MediaPicker>(
  (Ref ref) => SystemMediaPicker(),
);
