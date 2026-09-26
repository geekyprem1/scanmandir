import 'dart:convert';

import 'package:scan_my_mandir/core/environment.dart';
import 'package:scan_my_mandir/core/network/http_transport.dart';

/// Test transport. Lets a test drive the real app and real controllers without a server
/// and without waiting on real timeouts.
class FakeHttpTransport implements HttpTransport {
  FakeHttpTransport({this.readyResponse, this.throwFailure});

  /// Body returned for /health/ready. Defaults to a healthy backend.
  final Map<String, Object?>? readyResponse;

  /// When set, every call throws this instead of responding.
  final TransportException? throwFailure;

  final List<Uri> requested = <Uri>[];

  @override
  Future<HttpOutcome> get(
    Uri uri, {
    Map<String, String> headers = const <String, String>{},
    Duration timeout = const Duration(seconds: 15),
  }) async {
    requested.add(uri);
    final TransportException? failure = throwFailure;
    if (failure != null) throw failure;

    if (uri.path == '/health') {
      return HttpOutcome(
        statusCode: 200,
        body: jsonEncode(<String, Object?>{'status': 'ok'}),
      );
    }
    if (uri.path == '/health/ready') {
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
  );
}
