import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studygyaan_app/data/models.dart';

/// Pure parsing tests — koi Firebase connection nahi chahiye.
void main() {
  test('helpers: tolerant parsing', () {
    expect(str(null, 'x'), 'x');
    expect(str(12), '12');
    expect(intNum('42'), 42);
    expect(intNum('abc', 7), 7);
    expect(intNum(3.6), 4);
    expect(dblNum('0.5'), 0.5);
    expect(
      tsDate(Timestamp.fromMillisecondsSinceEpoch(1000000))
          ?.millisecondsSinceEpoch,
      1000000,
    );
    expect(tsDate('2026-01-02T03:04:05Z')?.year, 2026);
    expect(tsDate(null), null);
    expect(visibleStatus(''), true);
    expect(visibleStatus(null), true);
    expect(visibleStatus('draft'), false);
    expect(visibleStatus('published'), true);
    expect(timeAgo(DateTime.now().subtract(const Duration(minutes: 5))),
        '5m pehle');
    expect(timeAgo(null), '');
  });

  test('videoId: direct field + URL forms', () {
    expect(videoIdFromMap({'youtubeVideoId': 'abc123'}), 'abc123');
    expect(videoIdFromMap({'videoYouTubeId': 'xyz789'}), 'xyz789');
    expect(
      videoIdFromMap({'youtubeUrl': 'https://www.youtube.com/watch?v=vid0001'}),
      'vid0001',
    );
    expect(videoIdFromMap({'youtubeUrl': 'https://youtu.be/short002'}), 'short002');
    expect(videoIdFromMap({'title': 'no video'}), '');
  });

  test('JobItem parsing', () {
    final j = JobItem.fromDoc('j1', {
      'title': '  Clerk Bharti ',
      'organization': 'SSC',
      'vacancies': 500,
      'lastDate': '2026-12-01',
      'applyLink': 'https://x.in/apply',
      'articleHtml': '<p>hello</p>',
      'highlights': ['a', 'b'],
      'faqs': [
        {'question': 'Q?', 'answer': 'A.'},
      ],
      'status': '',
    });
    expect(j.id, 'j1');
    expect(j.title, 'Clerk Bharti'); // pick() trims
    expect(j.org, 'SSC');
    expect(j.vacancies, '500');
    expect(j.applyLink, 'https://x.in/apply');
    expect(j.highlights, ['a', 'b']);
    expect(j.faqs.length, 1);
    expect(j.faqs.first.q, 'Q?');
  });

  test('MockTest parsing + question filter', () {
    final t = MockTest.fromDoc('t1', {
      'title': 'GK Test',
      'durationMinutes': '30',
      'negativeMarking': 0.5,
      'isPremium': true,
      'questions': [
        {
          'qText': '2+2?',
          'options': ['3', '4', '5'],
          'correctOption': 1,
          'qLogic': 'basic math',
        },
        {'qText': '', 'options': ['a', 'b']}, // kharab — filter out
        {'qText': 'solo', 'options': ['only']}, // <2 options — filter out
      ],
    });
    expect(t.title, 'GK Test');
    expect(t.durationMin, 30);
    expect(t.negMarks, 0.5);
    expect(t.premium, true);
    expect(t.questions.length, 1);
    expect(t.questions.first.correct, 1);
    expect(t.questions.first.explanation, 'basic math');
  });

  test('StoryItem pages fallback (pages/slides)', () {
    final s1 = StoryItem.fromDoc('s1', {
      'title': 'S',
      'poster': 'https://x.in/p.jpg',
      'slides': [
        {'heading': 'H', 'text': 'T', 'image': 'https://x.in/i.jpg'},
      ],
    });
    expect(s1.pages.length, 1);
    expect(s1.pages.first.heading, 'H');
    final s2 = StoryItem.fromDoc('s2', {'title': 'Empty'});
    expect(s2.pages, isEmpty);
  });

  test('Bookmark/History JSON round-trip', () {
    final b = BookmarkEntry(
      kind: 'job',
      id: 'j1',
      title: 'T',
      image: '',
      ts: DateTime.fromMillisecondsSinceEpoch(1000),
    );
    final b2 = BookmarkEntry.fromJson(b.toJson());
    expect(b2.kind, 'job');
    expect(b2.ts?.millisecondsSinceEpoch, 1000);

    final h = const HistoryEntry(
      testId: 't1',
      title: 'T',
      score: 8,
      total: 10,
      correct: 4,
      wrong: 1,
      skipped: 0,
      ts: null,
    );
    expect(HistoryEntry.fromJson(h.toJson()).score, 8);
  });
}
