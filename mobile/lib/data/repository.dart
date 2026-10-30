import 'package:cloud_firestore/cloud_firestore.dart';

import 'models.dart';

/// Website wali queries (createdAt-desc + limit). Draft/hidden docs
/// client-side filter (koi composite index nahi chahiye).
class Repo {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  static const String blogs = 'blogs';
  static const String jobs = 'jobs';
  static const String updates = 'fast_track';
  static const String tests = 'mock_tests';
  static const String stories = 'web_stories';

  static Stream<List<T>> streamLatest<T>(
    String collection,
    int count,
    T Function(String id, Map<String, dynamic> json) parse,
  ) {
    return _db
        .collection(collection)
        .orderBy('createdAt', descending: true)
        .limit(count)
        .snapshots()
        .map(
          (snap) => snap.docs
              .where((d) => visibleStatus(d.data()['status']))
              .map((d) => parse(d.id, d.data()))
              .toList(),
        );
  }

  static Future<T?> getDoc<T>(
    String collection,
    String id,
    T Function(String, Map<String, dynamic>) parse,
  ) async {
    final snap = await _db.collection(collection).doc(id).get();
    if (!snap.exists) return null;
    return parse(snap.id, snap.data() ?? {});
  }

  /// Teenon collections se video-wale docs, date-sort, top 30.
  /// (Ek collection fail to baaki wali videos phir bhi aayengi.)
  static Future<List<VideoItem>> fetchVideos() async {
    const sources = {
      'jobs': 'Job',
      'fast_track': 'Update',
      'mock_tests': 'Mock Test',
    };
    final out = <VideoItem>[];
    for (final col in sources.keys) {
      try {
        final snap = await _db
            .collection(col)
            .orderBy('createdAt', descending: true)
            .limit(30)
            .get();
        for (final d in snap.docs) {
          final m = d.data();
          if (!visibleStatus(m['status'])) continue;
          final vid = videoIdFromMap(m);
          if (vid.isEmpty) continue;
          out.add(
            VideoItem(
              id: d.id,
              title: pick(m, ['title']),
              source: sources[col] ?? col,
              date: tsDate(m['publishedAt']) ?? tsDate(m['createdAt']),
              videoId: vid,
            ),
          );
        }
      } catch (_) {
        // ignore — baaki sources se kaam chalega
      }
    }
    out.sort(
      (a, b) => (b.date ?? DateTime(2000)).compareTo(a.date ?? DateTime(2000)),
    );
    return out.take(30).toList();
  }

  /// App user-data website wale users/{uid} doc me (merge) — rules pehle se OK.
  static DocumentReference<Map<String, dynamic>> userDoc(String uid) =>
      _db.collection('users').doc(uid);
}
