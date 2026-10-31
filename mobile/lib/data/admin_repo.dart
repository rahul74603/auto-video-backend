import 'package:cloud_firestore/cloud_firestore.dart';

import 'models.dart';

/// Website admin (src/pages/Admin/*) ka mobile mirror — same collections,
/// same status values, same publish payloads. Rules me admin write pehle
/// se allowed hai (isAdmin = rahulkumar74603@gmail.com).

const String editorialAuthor = 'StudyGyaan Editorial Team';

/// Website createSlug mirror (AdminBrowseTab).
String createSlug(String title) {
  var s = title.toLowerCase().trim().replaceAll(RegExp(r'[^\w\s-]'), '');
  s = s.replaceAll(RegExp(r'[\s_-]+'), '-');
  s = s.replaceAll(RegExp(r'^-+|-+$'), '');
  return s.length > 80 ? s.substring(0, 80) : s;
}

/// Website sanitizeJobFee mirror (sirf number, warna 0/blank).
String sanitizeJobFee(dynamic value) {
  final raw = str(value).trim();
  if (raw.isEmpty) return '';
  if (!RegExp(r'\d').hasMatch(raw)) {
    final free = RegExp(
      r'(nil|free|no\s*fee|n\/a|na\b)',
      caseSensitive: false,
    ).hasMatch(raw);
    return free ? '0' : '';
  }
  final m = RegExp(r'\d+').firstMatch(raw.replaceAll(',', ''));
  return m?.group(0) ?? '';
}

/// Website sanitizePublishDate mirror (YYYY-MM-DD ya digit-wala raw).
String sanitizePublishDate(dynamic value) {
  final raw = str(value).trim();
  if (raw.isEmpty) return '';
  final iso = _toIsoDate(raw);
  if (iso != null) return iso;
  if (!RegExp(r'\d').hasMatch(raw)) return '';
  return raw.length > 40 ? raw.substring(0, 40) : raw;
}

String? _toIsoDate(String raw) {
  final m = RegExp(r'^(\d{2})[-/](\d{2})[-/](\d{4})$').firstMatch(raw);
  if (m != null) return '${m.group(3)}-${m.group(2)}-${m.group(1)}';
  try {
    final d = DateTime.parse(raw);
    final y = d.year.toString().padLeft(4, '0');
    final mo = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$mo-$day';
  } catch (_) {
    return null;
  }
}

int wordCountOf(String html) {
  final t = html
      .replaceAll(RegExp(r'<[^>]*>'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (t.isEmpty) return 0;
  return t.split(' ').length;
}

/// ai_article_drafts ka list-view record (poora map `raw` me).
class AIDraft {
  final String id;
  final String type;
  final String status;
  final String reviewStatus;
  final bool reviewStale;
  final String verdict;
  final num score;
  final List<String> issues;
  final String title;
  final String slug;
  final String authorName;
  final String articleHtml;
  final int wordCount;
  final Map<String, dynamic> raw;

  const AIDraft({
    required this.id,
    required this.type,
    required this.status,
    required this.reviewStatus,
    required this.reviewStale,
    required this.verdict,
    required this.score,
    required this.issues,
    required this.title,
    required this.slug,
    required this.authorName,
    required this.articleHtml,
    required this.wordCount,
    required this.raw,
  });

  factory AIDraft.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    final rr = asMap(m['reviewReport']);
    final rawIssues = rr['issues'];
    return AIDraft(
      id: d.id,
      type: str(m['type']),
      status: str(m['status']),
      reviewStatus: str(m['reviewStatus']),
      reviewStale: m['reviewStale'] == true,
      verdict: str(rr['verdict']),
      score: rr['score'] is num ? (rr['score'] as num) : 0,
      issues: rawIssues is List
          ? rawIssues.map(str).where((e) => e.isNotEmpty).toList()
          : [],
      title: str(m['title']),
      slug: str(m['slug']),
      authorName: str(m['authorName']),
      articleHtml: str(m['articleHtml']),
      wordCount: m['wordCount'] is num ? (m['wordCount'] as num).toInt() : 0,
      raw: m,
    );
  }
}

/// purchases (pending) ka record.
class PaymentReq {
  final String id;
  final String userEmail;
  final String userId;
  final String utr;
  final String amount;
  final String screenshotUrl;
  final String itemName;
  final String itemId;
  final DateTime? date;

  const PaymentReq({
    required this.id,
    required this.userEmail,
    required this.userId,
    required this.utr,
    required this.amount,
    required this.screenshotUrl,
    required this.itemName,
    required this.itemId,
    required this.date,
  });

  factory PaymentReq.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return PaymentReq(
      id: d.id,
      userEmail: str(m['userEmail']),
      userId: str(m['userId']),
      utr: str(m['utr']),
      amount: str(m['amount']),
      screenshotUrl: str(m['screenshotUrl']),
      itemName: str(m['itemName']),
      itemId: pick(m, ['itemId', 'courseId']),
      date: tsDate(m['timestamp']) ?? tsDate(m['createdAt']),
    );
  }
}

class AdminRepo {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  static const String aiDrafts = 'ai_article_drafts';
  static const String jobDrafts = 'job_drafts';
  static const String jobs = 'jobs';
  static const String fastTrack = 'fast_track';
  static const String purchases = 'purchases';
  static const String users = 'users';

  // ---------------- AI DRAFTS ----------------

  static Stream<List<AIDraft>> streamAIDrafts([int n = 100]) => _db
      .collection(aiDrafts)
      .orderBy('createdAt', descending: true)
      .limit(n)
      .snapshots()
      .map((s) => s.docs.map(AIDraft.fromDoc).toList());

  static Future<AIDraft?> fetchAIDraft(String id) async {
    final s = await _db.collection(aiDrafts).doc(id).get();
    if (!s.exists) return null;
    return AIDraft.fromDoc(s);
  }

  static Future<void> updateAIDraft(String id, Map<String, dynamic> patch) =>
      _db.collection(aiDrafts).doc(id).update({
        ...patch,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  static Future<void> deleteAIDraft(String id) =>
      _db.collection(aiDrafts).doc(id).delete();

  /// canPublishDraft mirror — ok=false + Hindi reason.
  static ({bool ok, String reason}) canPublishAIDraft(AIDraft d) {
    if (d.status == 'published') {
      return (ok: false, reason: 'Ye draft pehle se publish ho chuka hai');
    }
    if (d.reviewStale) {
      return (ok: false, reason: 'Edit ke baad review pending hai');
    }
    if (d.reviewStatus != 'passed' || d.verdict != 'pass') {
      final iss = d.issues.take(3).join('; ');
      return (
        ok: false,
        reason: 'Fact & Quality review paas nahi hua'
            '${iss.isEmpty ? '' : ' — $iss'}',
      );
    }
    if (d.authorName != editorialAuthor) {
      return (
        ok: false,
        reason: 'Author label "$editorialAuthor" hona chahiye',
      );
    }
    return (ok: true, reason: '');
  }

  /// publishDraftClientSide mirror (SEO-taxonomy/history metadata chhod ke —
  /// core payload, doc-id, draft-delete, origin-cleanup bilkul same).
  static Future<
      ({String collection, String docId, bool originDeleted})> publishAIDraft(
    AIDraft d, {
    bool adminOverride = false,
  }) async {
    if (d.status == 'published') {
      throw StateError('Ye draft pehle se publish ho chuka hai');
    }
    if (!adminOverride) {
      final gate = canPublishAIDraft(d);
      if (!gate.ok) throw StateError(gate.reason);
    }
    final m = d.raw;
    final title = str(m['title']);
    final slug = str(m['slug']);
    final html = str(m['articleHtml']);
    if (title.isEmpty || slug.isEmpty || html.isEmpty) {
      throw StateError(
        'Draft me title/slug/article missing hai — publish nahi ho sakta',
      );
    }
    final isJob = d.type == 'JOB';
    final target = isJob ? jobs : fastTrack;
    final publishedDocId = str(m['publishedDocId']);
    final base = slug.length > 90 ? slug.substring(0, 90) : slug;
    final targetId = publishedDocId.isNotEmpty
        ? publishedDocId
        : '${isJob ? 'job' : 'ft'}-$base';

    final payload = isJob ? _jobPayload(m, d.id) : _ftPayload(m, d.id);
    final ref = _db.collection(target).doc(targetId);
    final existing = await ref.get();
    final em = existing.exists ? (existing.data() ?? {}) : null;
    await ref.set({
      ...payload,
      'createdAt': em?['createdAt'] ?? FieldValue.serverTimestamp(),
      'publishedAt': em?['publishedAt'] ?? FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    try {
      await _db.collection(aiDrafts).doc(d.id).delete();
    } catch (_) {}

    var originDeleted = false;
    final origin = _sanitizeOrigin(m['originRef']);
    if (origin != null) {
      try {
        await _db.collection(origin.$1).doc(origin.$2).delete();
        originDeleted = true;
      } catch (_) {}
    }
    return (collection: target, docId: targetId, originDeleted: originDeleted);
  }

  static (String, String)? _sanitizeOrigin(dynamic raw) {
    if (raw is! Map) return null;
    final col = str(raw['collection']);
    final id = str(raw['id']);
    if (col != jobDrafts && col != fastTrack) return null;
    if (id.isEmpty || id.length > 150 || RegExp(r'[/\\]').hasMatch(id)) {
      return null;
    }
    return (col, id);
  }

  static Map<String, dynamic> _stripEmpty(Map<String, dynamic> obj) {
    final out = <String, dynamic>{};
    obj.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.trim().isEmpty) return;
      if (v is List && v.isEmpty) return;
      out[k] = v;
    });
    return out;
  }

  static Map<String, dynamic> _jobPayload(
    Map<String, dynamic> m,
    String draftId,
  ) {
    final facts = asMap(m['facts']);
    final short = str(m['shortDescription']);
    return _stripEmpty({
      'title': str(m['title']),
      'slug': str(m['slug']),
      'metaDescription': str(m['metaDescription']),
      'description': short.isNotEmpty ? short : str(m['metaDescription']),
      'articleHtml': str(m['articleHtml']),
      'faqs': m['faqs'] is List ? m['faqs'] : [],
      'officialLinks': m['officialLinks'] is List ? m['officialLinks'] : [],
      'schemaMarkup': str(m['structuredData']),
      'authorName': editorialAuthor,
      'author': editorialAuthor,
      'type': 'JOB',
      'status': 'published',
      'keywords': m['keywords'] is List ? m['keywords'] : [],
      'wordCount': m['wordCount'] is num ? (m['wordCount'] as num).toInt() : 0,
      'sourceUrl': str(m['sourceUrl']),
      'publishedFromDraftId': draftId,
      'organization': str(facts['organization']),
      'advtNo': str(facts['advtNo']),
      'category': str(facts['category']),
      'startDate': sanitizePublishDate(facts['startDate']),
      'lastDate': sanitizePublishDate(facts['lastDate']),
      'examDate': sanitizePublishDate(facts['examDate']),
      'vacancies': str(facts['vacancies']),
      'salary': str(facts['salary']),
      'qualification': str(facts['qualification']),
      'minAge': str(facts['minAge']),
      'ageLimit': str(facts['ageLimit']),
      'location': str(facts['location']),
      'selectionProcess': str(facts['selectionProcess']),
      'eligibility': str(facts['eligibility']),
      'feeGen': sanitizeJobFee(facts['feeGen']),
      'feeSCST': sanitizeJobFee(facts['feeSCST']),
      'feeFemale': sanitizeJobFee(facts['feeFemale']),
      'feeOBC': sanitizeJobFee(facts['feeOBC']),
      'applicationFee': str(facts['applicationFee']),
      'applyLink': str(facts['applyLink']),
      'notificationLink': str(facts['notificationLink']),
      'officialSiteLink': str(facts['officialSiteLink']),
    });
  }

  static Map<String, dynamic> _ftPayload(
    Map<String, dynamic> m,
    String draftId,
  ) {
    final facts = asMap(m['facts']);
    final short = str(m['shortDescription']);
    final cat = str(facts['category']);
    return _stripEmpty({
      'title': str(m['title']),
      'slug': str(m['slug']),
      'category': cat.isNotEmpty ? cat : 'Other',
      'org': str(facts['org']),
      'updateDate': str(facts['updateDate']),
      'directLink': str(facts['directLink']),
      'shortInfo': short.isNotEmpty ? short : str(m['metaDescription']),
      'description': short,
      'metaDescription': str(m['metaDescription']),
      'articleHtml': str(m['articleHtml']),
      'faqs': m['faqs'] is List ? m['faqs'] : [],
      'officialLinks': m['officialLinks'] is List ? m['officialLinks'] : [],
      'schemaMarkup': str(m['structuredData']),
      'authorName': editorialAuthor,
      'status': 'published',
      'keywords': m['keywords'] is List ? m['keywords'] : [],
      'wordCount': m['wordCount'] is num ? (m['wordCount'] as num).toInt() : 0,
      'sourceUrl': str(m['sourceUrl']),
      'publishedFromDraftId': draftId,
    });
  }

  // ---------------- JOB DRAFTS ----------------

  static Stream<List<Map<String, dynamic>>> streamJobDrafts([int n = 100]) =>
      _db
          .collection(jobDrafts)
          .orderBy('createdAt', descending: true)
          .limit(n)
          .snapshots()
          .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());

  static Future<void> updateJobDraft(
    String id,
    Map<String, dynamic> patch,
  ) =>
      _db.collection(jobDrafts).doc(id).update(patch);

  static Future<void> deleteJobDraft(String id) =>
      _db.collection(jobDrafts).doc(id).delete();

  /// AI queue (AdminJobDrafts handleGenerateArticle mirror).
  static Future<void> queueJobAI(String id, Map<String, dynamic> m) async {
    final candidates = [
      str(m['sourceUrl']),
      str(m['officialLink']),
      str(m['notificationLink']),
      str(m['applyLink']),
      str(m['link']),
    ].where((u) => u.isNotEmpty).toList();
    var sourceUrl = '';
    for (final u in candidates) {
      if (!_isFormPortal(u)) {
        sourceUrl = u;
        break;
      }
    }
    if (sourceUrl.isEmpty && candidates.isNotEmpty) {
      sourceUrl = candidates.first;
    }
    final patch = <String, dynamic>{
      'aiDraftRequested': true,
      'aiDrafted': false,
      'aiDraftTries': 0,
      'aiDraftLastTryAt': '2000-01-01T00:00:00.000Z',
    };
    if (sourceUrl.isNotEmpty && sourceUrl != str(m['sourceUrl'])) {
      patch['sourceUrl'] = sourceUrl;
    }
    await updateJobDraft(id, patch);
  }

  static bool _isFormPortal(String url) {
    const patterns = [
      r'cdn\.digialm\.com\/EForms',
      r'\/EForms\/',
      r'\/(login|signin|candidate-login)(\.html?|\.jsp|\.php)?(\?|$)',
      r'applyonline',
      r'onlineregistration',
    ];
    for (final p in patterns) {
      if (RegExp(p, caseSensitive: false).hasMatch(url)) return true;
    }
    return false;
  }

  /// Job draft → live job, SAME doc id (website BROWSE mirror).
  static Future<void> publishJobDraft(
    String draftId,
    Map<String, dynamic> clean,
  ) async {
    await _db.collection(jobs).doc(draftId).set({
      ...clean,
      'slug': draftId,
      'createdAt': DateTime.now().toIso8601String(),
    });
    try {
      await deleteJobDraft(draftId);
    } catch (_) {}
  }

  static Future<void> updateJob(String id, Map<String, dynamic> patch) =>
      _db.collection(jobs).doc(id).update(patch);

  // ---------------- FAST TRACK ----------------

  static Stream<List<Map<String, dynamic>>> streamFTDrafts([int n = 50]) =>
      _db
          .collection(fastTrack)
          .where('status', isEqualTo: 'draft')
          .orderBy('createdAt', descending: true)
          .limit(n)
          .snapshots()
          .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());

  static Future<void> approveFT(String id) =>
      _db.collection(fastTrack).doc(id).update({
        'status': 'published',
        'publishedAt': FieldValue.serverTimestamp(),
      });

  static Future<void> updateFT(String id, Map<String, dynamic> patch) =>
      _db.collection(fastTrack).doc(id).update({
        ...patch,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  static Future<void> deleteFT(String id) =>
      _db.collection(fastTrack).doc(id).delete();

  // ---------------- PAYMENTS ----------------

  static Stream<List<PaymentReq>> streamPendingPayments() => _db
      .collection(purchases)
      .where('status', isEqualTo: 'pending')
      .snapshots()
      .map((s) => s.docs.map(PaymentReq.fromDoc).toList());

  static Future<void> setPaymentStatus(
    String id,
    String status,
    String processedAt,
  ) =>
      _db
          .collection(purchases)
          .doc(id)
          .update({'status': status, 'processedAt': processedAt});

  /// approvePayment workflow mirror (status + course unlock).
  static Future<void> approvePayment({
    required String requestId,
    required String userId,
    required String itemId,
  }) async {
    final now = DateTime.now().toIso8601String();
    await setPaymentStatus(requestId, 'completed', now);
    await _db.collection(users).doc(userId).set({
      'purchased_$itemId': true,
      'lastPurchaseDate': now,
    }, SetOptions(merge: true));
  }

  static Future<void> rejectPayment(String requestId) async {
    await setPaymentStatus(
      requestId,
      'rejected',
      DateTime.now().toIso8601String(),
    );
  }

  // ---------------- GENERIC ----------------

  static Future<Map<String, dynamic>?> fetchDoc(
    String collection,
    String id,
  ) async {
    final s = await _db.collection(collection).doc(id).get();
    if (!s.exists) return null;
    return {'id': s.id, ...?s.data()};
  }

  static Future<int> countAll(String collection) async {
    final agg = await _db.collection(collection).count().get();
    return agg.count ?? 0;
  }

  static Future<int> countWhere(
    String collection,
    String field,
    String value,
  ) async {
    final agg = await _db
        .collection(collection)
        .where(field, isEqualTo: value)
        .count()
        .get();
    return agg.count ?? 0;
  }

  static Future<int> countAIPending() async {
    final s = await _db.collection(aiDrafts).limit(100).get();
    return s.docs.where((d) => str(d.data()['status']) != 'published').length;
  }
}
