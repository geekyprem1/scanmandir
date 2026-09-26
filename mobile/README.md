# Mobile app

Flutter, Android first. iOS host configuration exists but has not been built or validated — that is LATER-01.

## What exists today

Phase 1 shell only:

- App bootstrap, theme for light and dark, spacing scale, reusable widgets
- Hindi and English localization, switchable at runtime from Settings
- Route table with a labelled placeholder for every unbuilt screen
- The four controller states from `ARCHITECTURE.md` section 4, as types rather than flags
- API client over a transport seam, with backend error codes mapped to failure kinds
- Platform interfaces for camera/gallery, heading, credential storage, billing, background transfer and image preparation — interfaces only

## What does not exist yet

No camera, no upload, no scan, no report, no account, no billing. Those routes render an explicit "Not built yet" placeholder, on purpose: development scaffolding must never resemble a real scan result.

## Setup

```powershell
cd mobile
flutter pub get
```

Localization classes are generated into `lib/l10n/generated/` by `flutter gen-l10n`, which `flutter run` and `flutter build` trigger automatically.

## Running

The app needs the backend. Start it first (see `backend/README.md`), then:

```powershell
flutter run
```

On an Android emulator the API base URL defaults to `http://10.0.2.2:3000`. That is not a typo: `127.0.0.1` inside an emulator refers to the emulator itself, and `10.0.2.2` is the alias for the host machine's loopback. On a physical device, pass your machine's LAN address:

```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.50:3000
```

Settings shows whether the backend is reachable, which is the quickest way to confirm the wiring.

## Checks

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

## Configuration

Passed at build time with `--dart-define`. Nothing secret belongs here: anything compiled into an APK is readable by anyone who has the APK. Provider credentials stay on the server.

| Define | Default | Notes |
|---|---|---|
| `APP_FLAVOR` | `development` | `development`, `staging` or `production` |
| `API_BASE_URL` | platform-dependent localhost | **Required** for staging and production; the app refuses to start without it |

## Layout

```text
lib/
  main.dart                  Bootstrap
  app/                       App widget and route table
  core/
    environment.dart         Build-time configuration
    providers.dart           Dependency wiring, all overridable in tests
    model/                   Failure kinds and the UiState union
    network/                 Transport seam and API client
    designsystem/            Theme, spacing, shared widgets
    platform/                Interfaces for camera, heading, storage, billing
  l10n/                      .arb sources; generated/ is not analysed
  features/<feature>/
    presentation/            Widgets
    application/             Controllers
test/
  unit/                      Pure Dart
  widget/                    Full app against a fake transport
  support/                   Test doubles
```

## Notes on the design

**Recoverable and terminal errors are separate types.** A network timeout and an exhausted quota both fail, but the user is owed different things: a retry button, or an explanation and a way out. Making that part of `UiState` means a screen cannot forget the distinction.

**Heading is never a bare number.** `HeadingReading` carries the measurement kind and an accuracy status, and `HeadingUnavailable` is a case every consumer must handle. A compass reading says where the phone points — it cannot establish which way an idol faces, and it says nothing about where the mandir sits in the home. Those are separate user inputs (`ARCHITECTURE.md` section 8).

**No feature code imports a plugin.** Platform capabilities sit behind interfaces so replacing a package does not ripple into the domain or the report models.

**Unbuilt features are visible in development and hidden in production builds.** The navigation can be walked during development without a release ever showing a user an empty screen.

**Cleartext HTTP is allowed for localhost in debug only.** The network security config lives under `android/app/src/debug/`, so it cannot reach a release build. `INTERNET` is declared in the main manifest because Flutter only adds it to debug and profile builds automatically.

**The application ID is `com.scanmymandir.app`**, with `.debug` appended for debug builds so both can sit on one device. It cannot be changed after the first Play upload; confirm it at P12-01.
