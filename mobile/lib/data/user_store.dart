import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';
import 'repository.dart';

/// Bookmarks + test history.
/// Login = cloud sync (users/{uid} merge). Bina login / rules-deny = phone-local.
/// Koi bhi haal me UI kabhi atakta nahi.
class UserStore extends ChangeNotifier {
  List<BookmarkEntry> bookmarks = [];
  List<HistoryEntry> history = [];
  String? _uid;
  bool _ready = false;

  bool get ready => _ready;

  UserStore() {
    _loadLocal();
    FirebaseAuth.instance.authStateChanges().listen(_onAuth);
  }

  Future<void> _onAuth(User? user) async {
    _uid = user?.uid;
    if (_uid != null) await _loadCloud();
    notifyListeners();
  }

  Future<void> _loadLocal() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      bookmarks = _decodeBookmarks(prefs.getString('sg_bookmarks'));
      history = _decodeHistory(prefs.getString('sg_history'));
    } catch (_) {}
    _ready = true;
    notifyListeners();
  }

  Future<void> _saveLocal() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'sg_bookmarks',
        jsonEncode(bookmarks.map((e) => e.toJson()).toList()),
      );
      await prefs.setString(
        'sg_history',
        jsonEncode(history.map((e) => e.toJson()).toList()),
      );
    } catch (_) {}
  }

  Future<void> _loadCloud() async {
    final uid = _uid;
    if (uid == null) return;
    try {
      final snap = await Repo.userDoc(uid).get();
      final m = snap.data() ?? {};
      bookmarks = _unionBookmarks(
        bookmarks,
        _decodeBookmarksRaw(m['appBookmarks']),
      );
      history = _unionHistory(history, _decodeHistoryRaw(m['appHistory']));
      await _saveCloud(); // local wali cloud me merge-back
      await _saveLocal();
    } catch (_) {
      // Rules/network deny — local mode me chalo.
    }
  }

  Future<void> _saveCloud() async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await Repo.userDoc(uid).set(
        {
          'appBookmarks': bookmarks.map((e) => e.toJson()).toList(),
          'appHistory': history.map((e) => e.toJson()).toList(),
        },
        SetOptions(merge: true),
      );
    } catch (_) {}
  }

  bool isBookmarked(String kind, String id) =>
      bookmarks.any((e) => e.kind == kind && e.id == id);

  Future<void> toggleBookmark(BookmarkEntry entry) async {
    if (isBookmarked(entry.kind, entry.id)) {
      bookmarks.removeWhere((e) => e.kind == entry.kind && e.id == entry.id);
    } else {
      bookmarks = [entry, ...bookmarks].take(200).toList();
    }
    notifyListeners();
    await _saveLocal();
    await _saveCloud();
  }

  Future<void> saveHistory(HistoryEntry entry) async {
    history = [entry, ...history].take(100).toList();
    notifyListeners();
    await _saveLocal();
    await _saveCloud();
  }
}

List<BookmarkEntry> _decodeBookmarks(String? raw) {
  if (raw == null || raw.isEmpty) return [];
  try {
    final list = jsonDecode(raw) as List;
    return list.map((e) => BookmarkEntry.fromJson(asMap(e))).toList();
  } catch (_) {
    return [];
  }
}

List<HistoryEntry> _decodeHistory(String? raw) {
  if (raw == null || raw.isEmpty) return [];
  try {
    final list = jsonDecode(raw) as List;
    return list.map((e) => HistoryEntry.fromJson(asMap(e))).toList();
  } catch (_) {
    return [];
  }
}

List<BookmarkEntry> _decodeBookmarksRaw(dynamic v) {
  if (v is! List) return [];
  try {
    return v.map((e) => BookmarkEntry.fromJson(asMap(e))).toList();
  } catch (_) {
    return [];
  }
}

List<HistoryEntry> _decodeHistoryRaw(dynamic v) {
  if (v is! List) return [];
  try {
    return v.map((e) => HistoryEntry.fromJson(asMap(e))).toList();
  } catch (_) {
    return [];
  }
}

List<BookmarkEntry> _unionBookmarks(
  List<BookmarkEntry> a,
  List<BookmarkEntry> b,
) {
  final map = <String, BookmarkEntry>{};
  for (final e in [...a, ...b]) {
    map['${e.kind}/${e.id}'] = e;
  }
  final out = map.values.toList();
  out.sort((x, y) => (y.ts ?? DateTime(2000)).compareTo(x.ts ?? DateTime(2000)));
  return out.take(200).toList();
}

List<HistoryEntry> _unionHistory(List<HistoryEntry> a, List<HistoryEntry> b) {
  final out = [...a, ...b];
  out.sort((x, y) => (y.ts ?? DateTime(2000)).compareTo(x.ts ?? DateTime(2000)));
  return out.take(100).toList();
}
