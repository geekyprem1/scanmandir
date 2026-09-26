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
  }) async {
    try {
      final HttpClientRequest request = await _client
          .getUrl(uri)
          .timeout(timeout);
      headers.forEach(request.headers.set);
      final HttpClientResponse response = await request.close().timeout(
        timeout,
      );
      final String body = await response
          .transform(utf8.decoder)
          .join()
          .timeout(timeout);
      return HttpOutcome(statusCode: response.statusCode, body: body);
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
