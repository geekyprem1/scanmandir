import 'dart:math';

/// A version 4 UUID, for idempotency keys the client has to generate.
///
/// Hand-rolled rather than taking a dependency: the app needs exactly one identifier
/// format, the algorithm is fifteen lines, and every package added to a mobile build is
/// one more thing to keep patched.
String newUuidV4({Random? random}) {
  final Random source = random ?? Random.secure();
  final List<int> bytes = List<int>.generate(16, (_) => source.nextInt(256));

  // Version 4 and the RFC 4122 variant, so the value is a well-formed UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  final String hex = bytes
      .map((int byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();

  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
