# StudyGyaan App (Flutter — Android)

Website wala poora content (Jobs, Tests, Blogs, Updates, Stories, Videos) +
Google login + bookmarks/history sync + push-notification-ready.

**Website ko ZERO effect** — app wahi Firestore collections padhta hai jo
website padhti hai. Dono saath-saath chalte hain.

## Pinned versions (CI bhi yahi use karta hai)

| Cheez   | Version  |
| ------- | -------- |
| Flutter | 3.27.4   |
| Dart    | 3.6 (bundled) |
| AGP     | 8.5.2    |
| Kotlin  | 1.9.24   |
| Gradle  | 8.9      |
| minSdk  | 23       |

## Setup (pehli baar)

1. Flutter SDK install karo (3.27.x): https://docs.flutter.dev/get-started/install
2. `cd mobile && flutter pub get`
3. Firebase joddo — 2 tareeke (koi ek):
   - **A. `flutterfire configure`** (recommended): `dart pub global activate flutterfire_cli`,
     phir `flutterfire configure` (package: `in.studygyaan.app`) — ye
     `lib/firebase_options.dart` overwrite kar dega. ✅
   - **B. Manual**: Firebase console → Project Settings → Android app add
     (package `in.studygyaan.app`) → `google-services.json` download karke
     `mobile/android/app/` me rakho. (Ye file git me NAHI jayegi.)
4. **SHA-1 add karna MAT bhoolna** (Google login bina iske fail hoga):
   Firebase console → Project Settings → Android app → SHA certificate
   fingerprints → `keytool -list -v -keystore ~/.android/debug.keystore
   -alias androiddebugkey -storepass android -keypass android` wala SHA-1 paste karo.
5. `flutter run` (device/emulator) ya `flutter build apk --debug`.

> Bina Firebase config ke bhi app build + khulta hai — setup-screen dikhata
> hai (crash nahi). Isliye CI kabhi config ki wajah se red nahi hota.

## Firestore

- Reads: website wali public collections (koi rules change nahi chahiye).
- Writes: `users/{uid}` me merge (`appBookmarks`, `appHistory`, `fcmTokens`) —
  rules me owner-access pehle se hai (`firestore.rules` dekho), deploy ki
  zaroorat nahi. Rules-deny ho to app phone-local mode me chalta rahega.

## Push notifications (FCM)

App-side READY hai: permission + 4 topics (`studygyaan_all`, `govt_jobs`,
`mock_tests`, `blogs`) + token save + foreground banner + on/off toggles.

Baaki hai **server trigger** (naya content publish pe topic message bhejna) —
wo follow-up backend kaam hai (ai_backend script ya Cloud Function), is PR me nahi.

## Play Store checklist (publish se pehle)

- [ ] Real app icons (`flutter_launcher_icons` + designer art)
- [ ] Real release keystore + `key.properties` (abhi debug-signed)
- [ ] `flutter build appbundle --release`
- [ ] Play Console ($25 one-time) + store listing + privacy policy URL
- [ ] Flutter/AGP upgrade (tab tak jo latest stable ho) + targetSdk check

## Project map

```
lib/
  main.dart            entry + Firebase init + setup-screen fallback
  firebase_options.dart  PLACEHOLDER (flutterfire se replace hoga)
  core/  theme, widgets (loading/error/image/tiles/link-opener)
  data/  models, repository (Firestore), auth, user_store, messaging
  ui/    shell (bottom nav), home, content (blog/job/story/video),
         quiz (test info + quiz + result), menu (profile/bookmarks/history)
test/  models_test.dart (pure parsing, CI me chalta hai)
```

## CI

`.github/workflows/mobile-ci.yml` — har push pe: `pub get → analyze → test →
build apk --debug`. Laal ho to log me exact file:line milega.
