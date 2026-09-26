import 'failure.dart';

/// The four states every controller exposes, per ARCHITECTURE.md section 4.
///
/// Recoverable and terminal errors are separate types rather than a flag, because the
/// UI owes the user a different thing in each case: a retry, or an explanation and a
/// way out. Making that distinction part of the type stops a screen from forgetting it.
sealed class UiState<T> {
  const UiState();

  bool get isLoading => this is UiLoading<T>;

  T? get valueOrNull => switch (this) {
    UiContent<T>(:final value) => value,
    _ => null,
  };

  Failure? get failureOrNull => switch (this) {
    UiRecoverableError<T>(:final failure) => failure,
    UiTerminalError<T>(:final failure) => failure,
    _ => null,
  };
}

final class UiLoading<T> extends UiState<T> {
  const UiLoading();
}

final class UiContent<T> extends UiState<T> {
  const UiContent(this.value);
  final T value;
}

/// The user can act to move past this: retry, reconnect, retake.
final class UiRecoverableError<T> extends UiState<T> {
  const UiRecoverableError(this.failure);
  final Failure failure;
}

/// Nothing the user can do here resolves it; the screen must explain and offer an exit.
final class UiTerminalError<T> extends UiState<T> {
  const UiTerminalError(this.failure);
  final Failure failure;
}

/// Chooses the error state that matches the failure, so callers do not have to.
UiState<T> errorStateFor<T>(Failure failure) => failure.isRetryable
    ? UiRecoverableError<T>(failure)
    : UiTerminalError<T>(failure);
