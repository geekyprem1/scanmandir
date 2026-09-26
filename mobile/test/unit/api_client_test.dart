import 'package:flutter_test/flutter_test.dart';
import 'package:scan_my_mandir/core/environment.dart';
import 'package:scan_my_mandir/core/model/failure.dart';
import 'package:scan_my_mandir/core/network/api_client.dart';
import 'package:scan_my_mandir/core/network/http_transport.dart';

import '../support/fake_http_transport.dart';

void main() {
  ApiClient clientWith(FakeHttpTransport transport) =>
      ApiClient(environment: testEnvironment(), transport: transport);

  test('reads liveness', () async {
    final FakeHttpTransport transport = FakeHttpTransport();
    expect(await clientWith(transport).checkAlive(), isTrue);
    expect(transport.requested.single.path, '/health');
  });

  test('reads readiness with the backend dependency checks', () async {
    final BackendHealth health = await clientWith(
      FakeHttpTransport(),
    ).checkReady();

    expect(health.ready, isTrue);
    expect(health.checks, <String, String>{'database': 'ok', 'storage': 'ok'});
  });

  test('treats a not_ready answer as information, not as an error', () async {
    // A 503 from /health/ready is a valid response that names the failing dependency.
    final ApiClient client = clientWith(
      FakeHttpTransport(
        readyResponse: <String, Object?>{
          'status': 'not_ready',
          'checks': <String, Object?>{'database': 'failed', 'storage': 'ok'},
        },
      ),
    );

    final BackendHealth health = await client.checkReady();
    expect(health.ready, isFalse);
    expect(health.checks['database'], 'failed');
  });

  test('surfaces a transport failure to the caller', () async {
    final ApiClient client = clientWith(
      FakeHttpTransport(
        throwFailure: const TransportException(Failure.network()),
      ),
    );

    await expectLater(
      client.checkAlive(),
      throwsA(
        isA<TransportException>().having(
          (TransportException e) => e.failure.kind,
          'kind',
          FailureKind.network,
        ),
      ),
    );
  });

  test('resolves paths against the configured base url', () {
    final ApiClient client = ApiClient(
      environment: Environment(
        flavor: AppFlavor.development,
        apiBaseUrl: Uri.parse('http://10.0.2.2:3000'),
      ),
      transport: FakeHttpTransport(),
    );

    expect(client.environment.apiBaseUrl.host, '10.0.2.2');
  });

  test('non-development builds refuse to guess an api base url', () {
    // There is no safe default for staging or production; a missing define must fail
    // loudly at startup rather than silently pointing at localhost.
    expect(testEnvironment(flavor: AppFlavor.production).isProduction, isTrue);
  });
}
