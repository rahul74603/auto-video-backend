import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// Google login (Firebase Auth). Bina login bhi app poora readable hai.
class AuthService extends ChangeNotifier {
  User? _user;
  bool _busy = false;
  String? _error;

  User? get user => _user;
  bool get loggedIn => _user != null;
  bool get busy => _busy;
  String? get error => _error;

  AuthService() {
    FirebaseAuth.instance.authStateChanges().listen((u) {
      _user = u;
      notifyListeners();
    });
  }

  Future<bool> signInWithGoogle() async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final acc = await GoogleSignIn().signIn();
      if (acc == null) {
        _busy = false; // user ne cancel kiya
        notifyListeners();
        return false;
      }
      final g = await acc.authentication;
      if (g.idToken == null) {
        throw StateError(
          'Google idToken nahi mila — Firebase me SHA-1 / google-services.json check karo (README).',
        );
      }
      await FirebaseAuth.instance.signInWithCredential(
        GoogleAuthProvider.credential(
          idToken: g.idToken,
          accessToken: g.accessToken,
        ),
      );
      _busy = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = '$e'.replaceFirst('StateError: Bad state: ', '');
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> signOut() async {
    try {
      await GoogleSignIn().signOut();
    } catch (_) {}
    await FirebaseAuth.instance.signOut();
  }
}
