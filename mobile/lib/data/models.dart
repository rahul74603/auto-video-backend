import 'package:cloud_firestore/cloud_firestore.dart';

/// Website (src/types/firestore.ts) ke EXACT field-names ke tolerant parsers.
/// Har field missing/galat-type ho sakta hai — parser kabhi throw nahi karta.

// ---------- tolerant helpers ----------

String str(dynamic v, [String fb = '']) {
  if (v == null) return fb;
  if (v is String) return v;
  return '$v';
}

int intNum(dynamic v, [int fb = 0]) {
  if (v is int) return v;
  if (v is double) return v.round();
  if (v is String) return int.tryParse(v.trim()) ?? fb;
  return fb;
}

double dblNum(dynamic v, [double fb = 0]) {
  if (v is double) return v;
  if (v is int) return v.toDouble();
  if (v is String) return double.tryParse(v.trim()) ?? fb;
  return fb;
}

/// Timestamp (Firestore) / ISO-string / millis / DateTime — sab chalega.
DateTime? tsDate(dynamic v) {
  if (v == null) return null;
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  if (v is double) return DateTime.fromMillisecondsSinceEpoch(v.round());
  if (v is String) return DateTime.tryParse(v.trim());
  return null;
}

Map<String, dynamic> asMap(dynamic v) {
  if (v is Map) return Map<String, dynamic>.from(v);
  return const {};
}

List<String> asStringList(dynamic v) {
  if (v is List) return v.map((e) => '$e').toList();
  return const [];
}

/// Pehli non-empty value in key-order (website me har cheez ke 2-4 naam hain!).
String pick(Map<String, dynamic> m, List<String> keys) {
  for (final k in keys) {
    final v = str(m[k]).trim();
    if (v.isNotEmpty) return v;
  }
  return '';
}

/// Website lists me blank-status = published; ye wale chhupe rehte hain.
bool visibleStatus(dynamic status) {
  const hidden = {
    'draft',
    'pending',
    'archived',
    'rejected',
    'unpublished',
    'deleted',
    'expired',
  };
  final s = str(status).trim().toLowerCase();
  return s.isEmpty || !hidden.contains(s);
}

String timeAgo(DateTime? dt) {
  if (dt == null) return '';
  final diff = DateTime.now().difference(dt);
  if (diff.isNegative) return 'abhi';
  if (diff.inMinutes < 1) return 'abhi';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m pehle';
  if (diff.inHours < 24) return '${diff.inHours}h pehle';
  if (diff.inDays < 30) return '${diff.inDays}d pehle';
  final months = diff.inDays ~/ 30;
  if (months < 12) return '$months mahine pehle';
  return '${months ~/ 12} saal pehle';
}

/// YouTube video id: direct field ya watch/shorts/youtu.be URL se.
String videoIdFromMap(Map<String, dynamic> m) {
  final direct = pick(m, ['youtubeVideoId', 'videoYouTubeId']);
  if (direct.isNotEmpty) return direct;
  final url = pick(m, ['youtubeUrl', 'videoYouTubeUrl', 'youtubeVideoUrl']);
  if (url.isEmpty) return '';
  final patterns = [
    RegExp(r'[?&]v=([A-Za-z0-9_-]{5,})'),
    RegExp(r'youtu\.be/([A-Za-z0-9_-]{5,})'),
    RegExp(r'shorts/([A-Za-z0-9_-]{5,})'),
    RegExp(r'embed/([A-Za-z0-9_-]{5,})'),
  ];
  for (final p in patterns) {
    final match = p.firstMatch(url);
    if (match != null) return match.group(1)!;
  }
  return '';
}

// ---------- shared bits ----------

class Faq {
  final String q;
  final String a;
  const Faq({required this.q, required this.a});

  factory Faq.fromMap(Map<String, dynamic> m) => Faq(
        q: pick(m, ['question', 'q', 'title']),
        a: pick(m, ['answer', 'a', 'text', 'content']),
      );
}

class LinkBtn {
  final String label;
  final String url;
  const LinkBtn({required this.label, required this.url});

  factory LinkBtn.fromMap(Map<String, dynamic> m) => LinkBtn(
        label: pick(m, ['label', 'title', 'text']),
        url: pick(m, ['url', 'link', 'href']),
      );
}

// ---------- blog / update (shared article shape) ----------

class ArticleItem {
  final String id;
  final String title;
  final String excerpt;
  final String image;
  final String category;
  final String author;
  final String html;
  final DateTime? date;
  final List<Faq> faqs;
  final List<LinkBtn> links;
  final String videoId;

  const ArticleItem({
    required this.id,
    required this.title,
    required this.excerpt,
    required this.image,
    required this.category,
    required this.author,
    required this.html,
    required this.date,
    required this.faqs,
    required this.links,
    required this.videoId,
  });

  factory ArticleItem.fromDoc(String id, Map<String, dynamic> m) {
    final faqs = (m['faqs'] as List?)
            ?.map((e) => Faq.fromMap(asMap(e)))
            .where((f) => f.q.isNotEmpty)
            .toList() ??
        const [];
    final links = (m['officialLinks'] as List?)
            ?.map((e) => LinkBtn.fromMap(asMap(e)))
            .where((l) => l.url.isNotEmpty)
            .toList() ??
        const [];
    return ArticleItem(
      id: id,
      title: pick(m, ['title']),
      excerpt: pick(m, ['excerpt', 'metaDescription', 'description', 'shortInfo']),
      image: pick(m, ['imageUrl', 'image', 'photoUrl', 'bannerUrl']),
      category: pick(m, ['category']),
      author: pick(m, ['authorName', 'author']),
      html: pick(m, ['articleHtml', 'content', 'description']),
      date: tsDate(m['publishedAt']) ?? tsDate(m['createdAt']),
      faqs: faqs,
      links: links,
      videoId: videoIdFromMap(m),
    );
  }
}

// ---------- govt job ----------

class JobItem {
  final String id;
  final String title;
  final String org;
  final String vacancies;
  final String salary;
  final String qualification;
  final String location;
  final String lastDate;
  final String examDate;
  final String applyLink;
  final String notifLink;
  final String siteLink;
  final String image;
  final String category;
  final String html;
  final DateTime? date;
  final List<Faq> faqs;
  final List<String> highlights;
  final String videoId;

  const JobItem({
    required this.id,
    required this.title,
    required this.org,
    required this.vacancies,
    required this.salary,
    required this.qualification,
    required this.location,
    required this.lastDate,
    required this.examDate,
    required this.applyLink,
    required this.notifLink,
    required this.siteLink,
    required this.image,
    required this.category,
    required this.html,
    required this.date,
    required this.faqs,
    required this.highlights,
    required this.videoId,
  });

  factory JobItem.fromDoc(String id, Map<String, dynamic> m) {
    final faqs = (m['faqs'] as List?)
            ?.map((e) => Faq.fromMap(asMap(e)))
            .where((f) => f.q.isNotEmpty)
            .toList() ??
        const [];
    return JobItem(
      id: id,
      title: pick(m, ['title']),
      org: pick(m, ['organization', 'org', 'department']),
      vacancies: pick(m, ['vacancies', 'totalVacancies']),
      salary: pick(m, ['salary', 'payScale']),
      qualification: pick(m, ['qualification', 'eligibility', 'educationDetails']),
      location: pick(m, ['location', 'state']),
      lastDate: pick(m, ['lastDate']),
      examDate: pick(m, ['examDate']),
      applyLink: pick(m, ['applyLink']),
      notifLink: pick(m, ['notificationLink']),
      siteLink: pick(m, ['officialSiteLink', 'websiteLink', 'officialSourceUrl']),
      image: pick(m, ['imageUrl', 'image', 'photoUrl', 'bannerUrl']),
      category: pick(m, ['category', 'examFamily']),
      html: pick(m, ['articleHtml', 'description']),
      date: tsDate(m['publishedAt']) ?? tsDate(m['createdAt']),
      faqs: faqs,
      highlights: asStringList(m['highlights']),
      videoId: videoIdFromMap(m),
    );
  }
}

// ---------- mock test ----------

class MockQ {
  final String text;
  final String image;
  final List<String> options;
  final int correct;
  final String explanation;

  const MockQ({
    required this.text,
    required this.image,
    required this.options,
    required this.correct,
    required this.explanation,
  });

  factory MockQ.fromMap(Map<String, dynamic> m) {
    return MockQ(
      text: pick(m, ['qText', 'question', 'text']),
      image: pick(m, ['qImage', 'image']),
      options: asStringList(m['options']),
      correct: intNum(m['correctOption']),
      explanation: pick(m, ['qLogic', 'explanation', 'solution']),
    );
  }
}

class MockTest {
  final String id;
  final String title;
  final String exam;
  final String category;
  final int durationMin;
  final double negMarks;
  final List<MockQ> questions;
  final int totalQ;
  final bool premium;
  final DateTime? date;
  final String videoId;

  const MockTest({
    required this.id,
    required this.title,
    required this.exam,
    required this.category,
    required this.durationMin,
    required this.negMarks,
    required this.questions,
    required this.totalQ,
    required this.premium,
    required this.date,
    required this.videoId,
  });

  factory MockTest.fromDoc(String id, Map<String, dynamic> m) {
    final questions = (m['questions'] as List?)
            ?.map((e) => MockQ.fromMap(asMap(e)))
            .where((q) => q.text.isNotEmpty && q.options.length >= 2)
            .toList() ??
        const [];
    final duration = intNum(m['durationMinutes'], intNum(m['duration'], 0));
    return MockTest(
      id: id,
      title: pick(m, ['title']),
      exam: pick(m, ['exam']),
      category: pick(m, ['category']),
      durationMin: duration > 0 ? duration : (questions.isEmpty ? 10 : questions.length),
      negMarks: dblNum(m['negativeMarking']),
      questions: questions,
      totalQ: intNum(m['totalQuestions'], questions.length),
      premium: m['premium'] == true || m['isPremium'] == true,
      date: tsDate(m['publishedAt']) ?? tsDate(m['createdAt']),
      videoId: videoIdFromMap(m),
    );
  }
}

// ---------- web story ----------

class StoryPage {
  final String heading;
  final String text;
  final String image;
  final String bg;
  final String ctaText;
  final String ctaLink;

  const StoryPage({
    required this.heading,
    required this.text,
    required this.image,
    required this.bg,
    required this.ctaText,
    required this.ctaLink,
  });

  factory StoryPage.fromMap(Map<String, dynamic> m) {
    return StoryPage(
      heading: pick(m, ['heading', 'title']),
      text: pick(m, ['text', 'content']),
      image: pick(m, ['image']),
      bg: pick(m, ['bg', 'background']),
      ctaText: pick(m, ['ctaText', 'cta']),
      ctaLink: pick(m, ['ctaLink', 'link', 'url']),
    );
  }
}

class StoryItem {
  final String id;
  final String title;
  final String poster;
  final String category;
  final DateTime? date;
  final List<StoryPage> pages;

  const StoryItem({
    required this.id,
    required this.title,
    required this.poster,
    required this.category,
    required this.date,
    required this.pages,
  });

  factory StoryItem.fromDoc(String id, Map<String, dynamic> m) {
    final raw = (m['pages'] as List?) ?? (m['slides'] as List?) ?? const [];
    return StoryItem(
      id: id,
      title: pick(m, ['title']),
      poster: pick(m, ['poster', 'posterUrl', 'imageUrl', 'image']),
      category: pick(m, ['category']),
      date: tsDate(m['publishedAt']) ?? tsDate(m['createdAt']),
      pages: raw
          .map((e) => StoryPage.fromMap(asMap(e)))
          .where((p) => p.heading.isNotEmpty || p.text.isNotEmpty || p.image.isNotEmpty)
          .toList(),
    );
  }
}

// ---------- video (kisi bhi collection se) ----------

class VideoItem {
  final String id;
  final String title;
  final String source;
  final DateTime? date;
  final String videoId;

  const VideoItem({
    required this.id,
    required this.title,
    required this.source,
    required this.date,
    required this.videoId,
  });

  String get thumb => 'https://i.ytimg.com/vi/$videoId/hqdefault.jpg';
  String get watchUrl => 'https://www.youtube.com/watch?v=$videoId';
}

// ---------- user data (bookmarks / history) ----------

class BookmarkEntry {
  final String kind; // blog | update | job | test | story | video
  final String id;
  final String title;
  final String image;
  final DateTime? ts;

  const BookmarkEntry({
    required this.kind,
    required this.id,
    required this.title,
    required this.image,
    required this.ts,
  });

  Map<String, dynamic> toJson() => {
        'kind': kind,
        'id': id,
        'title': title,
        'image': image,
        'ts': ts?.millisecondsSinceEpoch ?? 0,
      };

  factory BookmarkEntry.fromJson(Map<String, dynamic> m) => BookmarkEntry(
        kind: str(m['kind']),
        id: str(m['id']),
        title: str(m['title']),
        image: str(m['image']),
        ts: tsDate(m['ts']),
      );
}

class HistoryEntry {
  final String testId;
  final String title;
  final int score;
  final int total;
  final int correct;
  final int wrong;
  final int skipped;
  final DateTime? ts;

  const HistoryEntry({
    required this.testId,
    required this.title,
    required this.score,
    required this.total,
    required this.correct,
    required this.wrong,
    required this.skipped,
    required this.ts,
  });

  Map<String, dynamic> toJson() => {
        'testId': testId,
        'title': title,
        'score': score,
        'total': total,
        'correct': correct,
        'wrong': wrong,
        'skipped': skipped,
        'ts': ts?.millisecondsSinceEpoch ?? 0,
      };

  factory HistoryEntry.fromJson(Map<String, dynamic> m) => HistoryEntry(
        testId: str(m['testId']),
        title: str(m['title']),
        score: intNum(m['score']),
        total: intNum(m['total']),
        correct: intNum(m['correct']),
        wrong: intNum(m['wrong']),
        skipped: intNum(m['skipped']),
        ts: tsDate(m['ts']),
      );
}
