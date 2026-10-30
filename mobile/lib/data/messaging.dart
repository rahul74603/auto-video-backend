import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'repository.dart';

/// FCM: permission + topics + foreground banner + token save.
/// Server-side trigger (naye content pe topic message) follow-up backend hai —
/// app-side sab ready. Koi step fail to app pe zero asar.
@pragma('vm:entry-point')
Future<void> _bgHandler(RemoteMessage message) async {
  // Background me system khud tray notification dikhata hai — yahan kuch nahi.
  debugPrint('FCM background: ${message.messageId}');
}

class MessagingService {
  static final GlobalKey<NavigatorState> navKey = GlobalKey<NavigatorState>();

  static const List<String> topics = [
    'studygyaan_all',
    'govt_jobs',
    'mock_tests',
    'blogs',
  ];

  static const Map<String, String> topicLabels = {
    'studygyaan_all': 'Sab updates',
    'govt_jobs': 'Nayi Govt Jobs',
    'mock_tests': 'Naye Mock Tests',
    'blogs': 'Naye Blogs',
  };

  static bool _inited = false;

  static Future<void> init({String? uid}) async {
    try {
      if (!_inited) {
        _inited = true;
        FirebaseMessaging.onBackgroundMessage(_bgHandler);
        await FirebaseMessaging.instance.requestPermission();
        FirebaseMessaging.onMessage.listen(_foreground);
      }
      final states = await topicStates();
      for (final t in topics) {
        if (states[t] ?? true) {
          try {
            await FirebaseMessaging.instance.subscribeToTopic(t);
          } catch (_) {}
        }
      }
      if (uid != null) await saveToken(uid);
    } catch (e) {
      debugPrint('FCM init skip: $e');
    }
  }

  static void _foreground(RemoteMessage m) {
    final ctx = navKey.currentContext;
    if (ctx == null) return;
    final n = m.notification;
    final title = n?.title ?? strOr(m.data['title'], 'StudyGyaan');
    final body = n?.body ?? strOr(m.data['body'], '');
    final text = body.isEmpty ? title : '$title — $body';
    ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(text)));
  }

  static String strOr(dynamic v, String fb) =>
      v is String && v.isNotEmpty ? v : fb;

  static Future<Map<String, bool>> topicStates() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return {
        for (final t in topics) t: prefs.getBool('sg_topic_$t') ?? true,
      };
    } catch (_) {
      return {for (final t in topics) t: true};
    }
  }

  static Future<void> setTopic(String topic, bool on) async {
    try {
      if (on) {
        await FirebaseMessaging.instance.subscribeToTopic(topic);
      } else {
        await FirebaseMessaging.instance.unsubscribeFromTopic(topic);
      }
    } catch (_) {}
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('sg_topic_$topic', on);
    } catch (_) {}
  }

  static Future<void> saveToken(String uid) async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return;
      await Repo.userDoc(uid).set(
        {
          'fcmTokens': FieldValue.arrayUnion([token]),
        },
        SetOptions(merge: true),
      );
    } catch (_) {}
  }
}
