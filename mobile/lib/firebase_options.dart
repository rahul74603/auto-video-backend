import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;

/// PLACEHOLDER — `flutterfire configure` se real file banti hai (steps: mobile/README.md).
/// Tab tak ye throw karta hai taaki app crash ki jagah setup-screen dikhaye.
/// (Agar sirf google-services.json rakha hai to native config se kaam chal jayega.)
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    throw UnsupportedError(
      'Firebase not configured. Run `flutterfire configure` or drop '
      'google-services.json into mobile/android/app/ (see mobile/README.md).',
    );
  }
}
