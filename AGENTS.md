# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Releasing

Releases are numbered by a single sequence shared between `releases/` and the
published folder `E:\GoogleDrive\Apps` — `Kinetic_vNN_stable.apk`, same NN in
both places. Never restart or reuse NN; check the published folder for the
highest NN, not the local one.

Before every build, bump `android.versionCode` in `app.json` to the NN this
build will ship as, and bump `expo.version` too. Android refuses to install
over an existing install with the same versionCode, so a stale versionCode
makes a release unsideloadable without an uninstall. (v01–v08 all shipped as
versionCode 1 for this reason.) `android/` is a gitignored prebuild output —
`app.json` is the source of truth; edit `android/app/build.gradle` to match
only when building without a clean prebuild.

After building, copy the APK to both `releases/` and the published folder.
