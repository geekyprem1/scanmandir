import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../model/failure.dart';

class HttpOutcome {
  const HttpOutcome({required this.statusCode, required this.body});

  final int statusCode;
  final String body;

  bool get isSuccess => statusCode >= 200 && statusCode < 300;

  /// Decoded body, or null when the response was not a JSON object.
  Map<String, Object?>? get jsonObject {
    try {
      final Object? decoded = jsonDecode(body);
      return decoded is Map<String, Object?> ? decoded : null;
    } on FormatException {
      return null;
    }
  }
}

/// Transport seam.
///
/// Every network call goes through this so tests can drive the app without a server and
/// without waiting on real timeouts. Widgets and controllers never touch dart:io.
abstract interface class HttpTransport {
  Future<HttpOutcome> get(
    Uri uri, {
    Map<String, String> headers,
    Duration timeout,
  });

  Future<HttpOutcome> post(
    Uri uri, {
    Map<String, String> headers,
    Object? jsonBody,
    Duration timeout,
  });

  /// Uploads bytes to a pre-signed URL.
  ///
  /// The URL carries its own authorization and its own constraints, so the headers come
  /// from the ticket the server issued rather than from the session.
  Future<HttpOutcome> putBytes(
    Uri uri, {
    required List<int> bytes,
    Map<String, String> headers,
    Duration timeout,
  });
}

/// Raised for transport-level failures. HTTP error statuses are not exceptions: they
/// come back as an HttpOutcome so the caller can read the server's error code.
class TransportException implements Exception {
  const TransportException(this.failure);
  final Failure failure;

  @override
  String toString() => 'TransportException($failure)';
}

class IoHttpTransport implements HttpTransport {
  IoHttpTransport({HttpClient? client}) : _client = client ?? HttpClient();

  final HttpClient _client;

  @override
  Future<HttpOutcome> get(
    Uri uri, {
    Map<String, String> headers = const <String, String>{},
    Duration timeout = const Duration(seconds: 15),
  }) {
    return _guard(() async {
      final HttpClientRequest request = await _client
          .getUrl(uri)
          .timeout(timeout);
      headers.forEach(request.headers.set);
      return _read(request, timeout);
    });
  }

  @override
  Future<HttpOutcome> post(
    Uri uri, {
    Map<String, String> headers = const <String, String>{},
    Object? jsonBody,
    Duration timeout = const Duration(seconds: 15),
  }) {
    return _guard(() async {
      final HttpClientRequest request = await _client
          .postUrl(uri)
          .timeout(timeout);
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      headers.forEach(request.headers.set);
      if (jsonBody != null) {
        request.write(jsonEncode(jsonBody));
      }
      return _read(request, timeout);
    });
  }

  @override
  Future<HttpOutcome> putBytes(
    Uri uri, {
    required List<int> bytes,
    Map<String, String> headers = const <String, String>{},
    Duration timeout = const Duration(seconds: 60),
  }) {
    return _guard(() async {
      final HttpClientRequest request = await _client
          .putUrl(uri)
          .timeout(timeout);
      headers.forEach(request.headers.set);
      request.contentLength = bytes.length;
      request.add(bytes);
      return _read(request, timeout);
    });
  }

  Future<HttpOutcome> _read(HttpClientRequest request, Duration timeout) async {
    final HttpClientResponse response = await request.close().timeout(timeout);
    final String body = await response
        .transform(utf8.decoder)
        .join()
        .timeout(timeout);
    return HttpOutcome(statusCode: response.statusCode, body: body);
  }

  /// Turns the platform's network exceptions into the app's failure vocabulary, in one
  /// place rather than once per verb.
  Future<HttpOutcome> _guard(Future<HttpOutcome> Function() send) async {
    try {
      return await send();
    } on TimeoutException catch (error) {
      throw TransportException(Failure.timeout(debugMessage: error.toString()));
    } on SocketException catch (error) {
      throw TransportException(Failure.network(debugMessage: error.message));
    } on HttpException catch (error) {
      throw TransportException(Failure.network(debugMessage: error.message));
    }
  }

  void close() => _client.close(force: true);
}
