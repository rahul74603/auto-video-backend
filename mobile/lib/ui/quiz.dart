import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/widgets.dart';
import '../data/auth.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../data/user_store.dart';
import 'menu.dart';

// ---------------- TEST LIST ----------------

class TestsScreen extends StatelessWidget {
  const TestsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mock Tests')),
      body: StreamBuilder<List<MockTest>>(
        stream: Repo.streamLatest(Repo.tests, 50, MockTest.fromDoc),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items =
              (snap.data ?? []).where((t) => t.title.isNotEmpty).toList();
          if (items.isEmpty) {
            return const EmptyView(message: 'Abhi koi test nahi hai');
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final t = items[i];
              return ContentTile(
                image: '',
                title: t.title,
                subtitle:
                    '${t.totalQ} Q • ${t.durationMin} min${t.exam.isNotEmpty ? ' • ${t.exam}' : ''}',
                date: [
                  if (t.premium) 'Premium',
                  timeAgo(t.date),
                ].where((e) => e.isNotEmpty).join(' • '),
                trailing: BookmarkButton(
                  entry: BookmarkEntry(
                    kind: 'test',
                    id: t.id,
                    title: t.title,
                    image: '',
                    ts: DateTime.now(),
                  ),
                ),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => TestInfoScreen(test: t)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

// ---------------- TEST INFO ----------------

class TestInfoScreen extends StatelessWidget {
  final MockTest? test;
  final String? testId;
  const TestInfoScreen({super.key, this.test, this.testId});

  @override
  Widget build(BuildContext context) {
    if (test != null) return _scaffold(context, test!);
    return Scaffold(
      appBar: AppBar(title: const Text('Mock Test')),
      body: FutureBuilder<MockTest?>(
        future: Repo.getDoc(Repo.tests, testId ?? '', MockTest.fromDoc),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError || snap.data == null) {
            return const ErrorView(message: 'Ye test nahi khula');
          }
          return _body(context, snap.data!);
        },
      ),
    );
  }

  Widget _scaffold(BuildContext context, MockTest t) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mock Test')),
      body: _body(context, t),
    );
  }

  Widget _body(BuildContext context, MockTest t) {
    final loggedIn = context.watch<AuthService>().loggedIn;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          t.title,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _chip('${t.totalQ} Questions'),
            _chip('${t.durationMin} min'),
            if (t.exam.isNotEmpty) _chip(t.exam),
            if (t.category.isNotEmpty) _chip(t.category),
            _chip('+2 sahi jawab'),
            if (t.negMarks > 0) _chip('-${t.negMarks} galat jawab'),
            if (t.premium) _chip('Premium'),
          ],
        ),
        if (t.premium && !loggedIn) ...[
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Icon(Icons.lock_outline),
                  const SizedBox(width: 8),
                  const Expanded(child: Text('Premium test — pehle login karo')),
                  FilledButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const MenuScreen()),
                    ),
                    child: const Text('Login'),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: t.questions.isEmpty
              ? null
              : () {
                  if (t.premium && !loggedIn) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Premium test ke liye login karo'),
                      ),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => QuizScreen(test: t)),
                  );
                },
          icon: const Icon(Icons.play_arrow),
          label: const Text('Test Start Karo'),
        ),
        if (t.videoId.isNotEmpty) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => openExternal(
              context,
              'https://www.youtube.com/watch?v=${t.videoId}',
            ),
            icon: const Icon(Icons.play_circle_outline),
            label: const Text('Solution Video'),
          ),
        ],
        if (t.questions.isEmpty) ...[
          const SizedBox(height: 12),
          const Text('Is test me abhi questions nahi hain.'),
        ],
      ],
    );
  }

  Widget _chip(String label) => Chip(label: Text(label));
}

// ---------------- QUIZ ----------------

class QuizScreen extends StatefulWidget {
  final MockTest test;
  const QuizScreen({super.key, required this.test});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  late final PageController _controller;
  final Map<int, int> _answers = {};
  int _index = 0;
  late int _remaining;
  Timer? _timer;
  bool _submitting = false;

  MockTest get _test => widget.test;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    _remaining = _test.durationMin * 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _submitting) return;
      setState(() => _remaining--);
      if (_remaining <= 0) _submit(auto: true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  String get _clock {
    final s = _remaining < 0 ? 0 : _remaining;
    final mm = (s ~/ 60).toString().padLeft(2, '0');
    final ss = (s % 60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final total = _test.questions.length;
    return Scaffold(
      appBar: AppBar(
        title: Text('Q ${_index + 1}/$total'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Chip(
              avatar: const Icon(Icons.timer_outlined, size: 18),
              label: Text(_clock),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(value: (_index + 1) / total),
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: total,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) => _questionCard(i),
            ),
          ),
          _bottomBar(total),
        ],
      ),
    );
  }

  Widget _questionCard(int i) {
    final q = _test.questions[i];
    final picked = _answers[i];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          q.text,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        if (q.image.isNotEmpty) ...[
          const SizedBox(height: 12),
          ThumbImage(url: q.image, height: 180),
        ],
        const SizedBox(height: 16),
        for (var o = 0; o < q.options.length; o++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _optionTile(i, o, q.options[o], picked == o),
          ),
      ],
    );
  }

  Widget _optionTile(int qi, int oi, String text, bool selected) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => setState(() => _answers[qi] = oi),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? scheme.primary : scheme.outlineVariant,
            width: selected ? 2 : 1,
          ),
          color: selected
              ? scheme.primaryContainer.withOpacity(0.35)
              : Colors.transparent,
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 14,
              backgroundColor:
                  selected ? scheme.primary : scheme.surfaceContainerHighest,
              child: Text(
                String.fromCharCode(65 + oi),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: selected
                      ? scheme.onPrimary
                      : scheme.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 15))),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar(int total) {
    final last = _index == total - 1;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            OutlinedButton(
              onPressed: _index == 0
                  ? null
                  : () => _controller.previousPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
              child: const Text('Prev'),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: () => _palette(total),
              icon: const Icon(Icons.grid_view),
              label: Text('${_answers.length}/$total'),
            ),
            const Spacer(),
            FilledButton(
              onPressed: last
                  ? () => _confirmSubmit()
                  : () => _controller.nextPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
              child: Text(last ? 'Submit' : 'Next'),
            ),
          ],
        ),
      ),
    );
  }

  void _palette(int total) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 6,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        itemCount: total,
        itemBuilder: (ctx, i) {
          final done = _answers.containsKey(i);
          return InkWell(
            onTap: () {
              Navigator.of(ctx).pop();
              _controller.jumpToPage(i);
            },
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: done
                    ? Theme.of(context).colorScheme.primary
                    : Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${i + 1}',
                style: TextStyle(
                  color: done ? Colors.white : null,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ));
          },
        ),
      ),
    );
  }

  void _confirmSubmit() {
    final unanswered = _test.questions.length - _answers.length;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Submit test?'),
        content: Text(
          unanswered == 0
              ? 'Saare jawab diye — result dekho!'
              : '$unanswered sawal chhoote hain. Phir bhi submit?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Ruko'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _submit();
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit({bool auto = false}) async {
    if (_submitting || !mounted) return;
    _submitting = true;
    _timer?.cancel();
    final result = ResultCalc.calc(_test, _answers);
    try {
      await context.read<UserStore>().saveHistory(
            HistoryEntry(
              testId: _test.id,
              title: _test.title,
              score: result.score,
              total: _test.questions.length * 2,
              correct: result.correct,
              wrong: result.wrong,
              skipped: result.skipped,
              ts: DateTime.now(),
            ),
          );
    } catch (_) {}
    if (!mounted) return;
    if (auto) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Time khatm — auto submit!')),
      );
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ResultScreen(test: _test, answers: Map.of(_answers)),
      ),
    );
  }
}

/// Scoring: +2 sahi (website jaisa), -negMarks galat.
class ResultCalc {
  final int score;
  final int correct;
  final int wrong;
  final int skipped;

  const ResultCalc({
    required this.score,
    required this.correct,
    required this.wrong,
    required this.skipped,
  });

  static ResultCalc calc(MockTest test, Map<int, int> answers) {
    var correct = 0;
    var wrong = 0;
    var skipped = 0;
    for (var i = 0; i < test.questions.length; i++) {
      final q = test.questions[i];
      final userAns = answers[i];
      if (userAns == null) {
        skipped++;
        continue;
      }
      final validCorrect = q.correct >= 0 && q.correct < q.options.length;
      if (validCorrect && userAns == q.correct) {
        correct++;
      } else {
        wrong++;
      }
    }
    final score = (correct * 2 - wrong * test.negMarks).round();
    return ResultCalc(
      score: score,
      correct: correct,
      wrong: wrong,
      skipped: skipped,
    );
  }
}

// ---------------- RESULT ----------------

class ResultScreen extends StatelessWidget {
  final MockTest test;
  final Map<int, int> answers;
  const ResultScreen({super.key, required this.test, required this.answers});

  @override
  Widget build(BuildContext context) {
    final r = ResultCalc.calc(test, answers);
    final total = test.questions.length;
    final pct = total == 0 ? 0 : (r.correct * 100 / total).round();
    return Scaffold(
      appBar: AppBar(title: const Text('Result')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    '$pct%',
                    style: const TextStyle(
                      fontSize: 52,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    'Score: ${r.score} / ${total * 2}',
                    style: const TextStyle(fontSize: 16),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _stat(context, '${r.correct}', 'Sahi', Colors.green),
                      _stat(context, '${r.wrong}', 'Galat', Colors.red),
                      _stat(context, '${r.skipped}', 'Chhoote', Colors.orange),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '+2 sahi • -${test.negMarks} galat',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => QuizScreen(test: test)),
                  ),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retake'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Share.share(
                    'Maine "${test.title}" me ${r.score}/${total * 2} score kiya! Tum bhi try karo: https://studygyaan.in',
                  ),
                  icon: const Icon(Icons.share),
                  label: const Text('Share'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Review answers',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          for (var i = 0; i < total; i++) _reviewTile(context, i),
        ],
      ),
    );
  }

  Widget _stat(BuildContext context, String n, String label, Color color) {
    return Column(
      children: [
        Text(
          n,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(label),
      ],
    );
  }

  Widget _reviewTile(BuildContext context, int i) {
    final q = test.questions[i];
    final userAns = answers[i];
    final validCorrect = q.correct >= 0 && q.correct < q.options.length;
    final isRight = validCorrect && userAns == q.correct;
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: ExpansionTile(
        leading: Icon(
          userAns == null
              ? Icons.remove_circle_outline
              : (isRight ? Icons.check_circle : Icons.cancel),
          color: userAns == null
              ? Colors.orange
              : (isRight ? Colors.green : Colors.red),
        ),
        title: Text('Q${i + 1}. ${q.text}', maxLines: 2),
        children: [
          for (var o = 0; o < q.options.length; o++)
            ListTile(
              dense: true,
              leading: Text(String.fromCharCode(65 + o)),
              title: Text(q.options[o]),
              tileColor: (validCorrect && o == q.correct)
                  ? Colors.green.withOpacity(0.12)
                  : (userAns == o ? Colors.red.withOpacity(0.12) : null),
            ),
          if (q.explanation.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Samjhao: ${q.explanation}',
                  style: const TextStyle(fontStyle: FontStyle.italic),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
