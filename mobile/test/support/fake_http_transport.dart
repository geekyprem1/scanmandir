import 'dart:convert';

import 'package:scan_my_mandir/core/environment.dart';
import 'package:scan_my_mandir/core/network/http_transport.dart';

/// One recorded request.
class RecordedCall {
  const RecordedCall({
    required this.method,
    required this.uri,
    required this.headers,
    this.body,
  });

  final String method;
  final Uri uri;
  final Map<String, String> headers;

  /// The JSON body of a post, or the bytes of an upload. Null when there was neither.
  final Object? body;

  String get path => uri.path;

  Map<String, Object?> get jsonBody => body is Map<String, Object?>
      ? body! as Map<String, Object?>
      : const <String, Object?>{};

  @override
  String toString() => '$method $uri';
}

/// Test transport. Lets a test drive the real app and real controllers without a server
/// and without waiting on real timeouts.
class FakeHttpTransport implements HttpTransport {
  FakeHttpTransport({this.readyResponse, this.throwFailure, this.responder});

  /// Body returned for /health/ready. Defaults to a healthy backend.
  final Map<String, Object?>? readyResponse;

  /// When set, every call throws this instead of responding.
  final TransportException? throwFailure;

  /// Scripted answers. Returning null falls through to the built-in health routes and
  /// then to a 404, so a test only scripts what it cares about.
  final Future<HttpOutcome?> Function(RecordedCall call)? responder;

  final List<RecordedCall> calls = <RecordedCall>[];

  /// Every uri asked for, in order. Kept for the tests that predate [calls].
  List<Uri> get requested => <Uri>[
    for (final RecordedCall call in calls) call.uri,
  ];

  @override
  Future<HttpOutcome> get(
    Uri uri, {
    Map<String, String> headers = const <String, String>{},
    Duration timeout = const Duration(seconds: 15),
  }) {
    return _respond(RecordedCall(method: 'GET', uri: uri, headers: headers));
  }

  @override
  Future<HttpOutcome> post(
    Uri uri, {
    Map<String, String> headers = const <String, String>{},
    Object? jsonBody,
    Duration timeout = const Duration(seconds: 15),
  }) {
    return _respond(
      RecordedCall(method: 'POST', uri: uri, headers: headers, body: jsonBody),
    );
  }

  @override
  Future<HttpOutcome> putBytes(
    Uri uri, {
    required List<int> bytes,
    Map<String, String> headers = const <String, String>{},
    Duration timeout = const Duration(seconds: 60),
  }) {
    return _respond(
      RecordedCall(method: 'PUT', uri: uri, headers: headers, body: bytes),
    );
  }

  Future<HttpOutcome> _respond(RecordedCall call) async {
    calls.add(call);

    final TransportException? failure = throwFailure;
    if (failure != null) throw failure;

    final Future<HttpOutcome?> Function(RecordedCall call)? script = responder;
    if (script != null) {
      final HttpOutcome? scripted = await script(call);
      if (scripted != null) return scripted;
    }

    if (call.path == '/health') {
      return HttpOutcome(
        statusCode: 200,
        body: jsonEncode(<String, Object?>{'status': 'ok'}),
      );
    }
    if (call.path == '/health/ready') {
      return HttpOutcome(
        statusCode: 200,
        body: jsonEncode(
          readyResponse ??
              <String, Object?>{
                'status': 'ready',
                'checks': <String, Object?>{'database': 'ok', 'storage': 'ok'},
              },
        ),
      );
    }

    return HttpOutcome(
      statusCode: 404,
      body: jsonEncode(<String, Object?>{
        'error': <String, Object?>{
          'code': 'NOT_FOUND',
          'message': 'Route not found.',
        },
      }),
    );
  }
}

/// Fixed environment for tests, avoiding the platform sniffing in [Environment.resolve].
Environment testEnvironment({AppFlavor flavor = AppFlavor.development}) {
  return Environment(
    flavor: flavor,
    apiBaseUrl: Uri.parse('http://127.0.0.1:3000'),
    // Stand-in values; tests never reach the real project (auth is faked).
    supabaseUrl: Uri.parse('https://test-project.supabase.co'),
    supabasePublishableKey: 'sb_publishable_test_key',
  );
}
