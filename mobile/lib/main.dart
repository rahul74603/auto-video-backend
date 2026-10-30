import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme.dart';
import 'data/auth.dart';
import 'data/messaging.dart';
import 'data/user_store.dart';
import 'firebase_options.dart';
import 'ui/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final firebaseOk = await _initFirebase();
  runApp(StudyGyaanApp(firebaseOk: firebaseOk));
}

/// Pehle native config (google-services.json), phir flutterfire options.
/// Dono fail = setup-screen (crash nahi).
Future<bool> _initFirebase() async {
  try {
    await Firebase.initializeApp();
    return true;
  } catch (_) {
    // Native config nahi — flutterfire options try karo.
  }
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    return true;
  } catch (_) {
    return false;
  }
}

class StudyGyaanApp extends StatelessWidget {
  final bool firebaseOk;

  const StudyGyaanApp({super.key, required this.firebaseOk});

  @override
  Widget build(BuildContext context) {
    if (!firebaseOk) {
      return MaterialApp(
        title: 'StudyGyaan',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: const SetupNeededScreen(),
      );
    }
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
        ChangeNotifierProvider(create: (_) => UserStore()),
      ],
      child: MaterialApp(
        title: 'StudyGyaan',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        navigatorKey: MessagingService.navKey,
        home: const Shell(),
      ),
    );
  }
}

/// Firebase config bina — developer ko seedhi steps (Play build me kabhi nahi dikhega).
class SetupNeededScreen extends StatelessWidget {
  const SetupNeededScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('StudyGyaan setup')),
      body: const Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Firebase connected nahi hai',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 12),
            Text(
              '1. Firebase console me Android app banao (package: in.studygyaan.app)\n'
              '2. SHA-1 add karo (Google login ke liye zaroori)\n'
              '3. google-services.json download karke mobile/android/app/ me rakho\n'
              '4. App dobara build karo\n\n'
              'Poori steps: mobile/README.md',
              style: TextStyle(fontSize: 15, height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}
