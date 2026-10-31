import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/widgets.dart';
import '../data/auth.dart';
import '../data/models.dart';
import '../data/repository.dart';
import 'content.dart';
import 'quiz.dart';

/// Home: welcome + quick chips + latest strips (Fast Track sabse pehle).
class HomeScreen extends StatelessWidget {
  final void Function(int) onSeeAll;
  const HomeScreen({super.key, required this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('StudyGyaan')),
      body: ListView(
        children: [
          _welcomeCard(context),
          _quickChips(context),
          SectionHeader(
            title: 'Fast Track',
            icon: Icons.bolt,
            onSeeAll: () => onSeeAll(2),
          ),
          _strip<ArticleItem>(
            icon: Icons.bolt,
            stream: Repo.streamLatest(Repo.updates, 8, ArticleItem.fromDoc),
            onTap: (a) => _push(
              context,
              ArticleScreen(kind: ContentKind.update, id: a.id),
            ),
          ),
          SectionHeader(
            title: 'Latest Govt Jobs',
            icon: Icons.work,
            onSeeAll: () => onSeeAll(1),
          ),
          _strip<JobItem>(
            icon: Icons.work,
            stream: Repo.streamLatest(Repo.jobs, 8, JobItem.fromDoc),
            onTap: (j) => _push(context, JobDetailScreen(id: j.id)),
          ),
          SectionHeader(
            title: 'Latest Blogs',
            icon: Icons.article,
            onSeeAll: () => _push(
              context,
              const ContentListScreen(kind: ContentKind.blog),
            ),
          ),
          _strip<ArticleItem>(
            icon: Icons.article,
            stream: Repo.streamLatest(Repo.blogs, 8, ArticleItem.fromDoc),
            onTap: (a) => _push(
              context,
              ArticleScreen(kind: ContentKind.blog, id: a.id),
            ),
          ),
          SectionHeader(
            title: 'Latest Mock Tests',
            icon: Icons.quiz,
            onSeeAll: () => onSeeAll(3),
          ),
          _strip<MockTest>(
            icon: Icons.quiz,
            stream: Repo.streamLatest(Repo.tests, 8, MockTest.fromDoc),
            onTap: (t) => _push(context, TestInfoScreen(test: t)),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  Widget _welcomeCard(BuildContext context) {
    final user = context.watch<AuthService>().user;
    final rawName = (user?.displayName ?? '').trim();
    final firstName = rawName.isEmpty ? '' : rawName.split(' ').first;
    final hello = firstName.isEmpty
        ? 'Namaste! Kya padhna hai aaj?'
        : 'Namaste, $firstName!';
    final sub = firstName.isEmpty
        ? 'Jobs • Tests • Blogs • Stories — sab yahi'
        : 'Aaj kya padhna hai? Fast Track se shuru karo';
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: Theme.of(context).colorScheme.primary,
              child: const Text(
                'SG',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hello,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(sub),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _quickChips(BuildContext context) {
    final chips = [
      _Chip('Jobs', Icons.work, () => onSeeAll(1)),
      _Chip('Fast Track', Icons.bolt, () => onSeeAll(2)),
      _Chip('Tests', Icons.quiz, () => onSeeAll(3)),
      _Chip(
        'Blogs',
        Icons.article,
        () => _push(context, const ContentListScreen(kind: ContentKind.blog)),
      ),
      _Chip(
        'Stories',
        Icons.auto_stories,
        () => _push(context, const StoriesScreen()),
      ),
      _Chip(
        'Videos',
        Icons.ondemand_video,
        () => _push(context, const VideosScreen()),
      ),
    ];
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        itemCount: chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) => ActionChip(
          avatar: Icon(chips[i].icon, size: 16),
          label: Text(chips[i].label),
          onPressed: chips[i].onTap,
        ),
      ),
    );
  }

  Widget _strip<T>({
    required IconData icon,
    required Stream<List<T>> stream,
    required void Function(T) onTap,
  }) {
    return StreamBuilder<List<T>>(
      stream: stream,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 170,
            child: LoadingView(label: ''),
          );
        }
        if (snap.hasError || !(snap.hasData && snap.data!.isNotEmpty)) {
          return const SizedBox(
            height: 60,
            child: EmptyView(message: 'Abhi kuch nahi — thodi der me dekho'),
          );
        }
        final items = snap.data!;
        return SizedBox(
          height: 200,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final item = items[i];
              final title = _titleOf(item);
              final image = _imageOf(item);
              final meta = _metaOf(item);
              final bm = _bookmarkOf(item);
              return SizedBox(
                width: 220,
                child: Card(
                  margin: EdgeInsets.zero,
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => onTap(item),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Stack(
                          children: [
                            ThumbImage(
                              url: image,
                              height: 110,
                              radius: 0,
                              icon: icon,
                            ),
                            Positioned(
                              right: 4,
                              top: 4,
                              child: BookmarkButton(entry: bm),
                            ),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.all(10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                meta,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }

  String _titleOf(dynamic item) {
    if (item is JobItem) return item.title;
    if (item is MockTest) return item.title;
    if (item is ArticleItem) return item.title;
    return '';
  }

  String _imageOf(dynamic item) {
    if (item is JobItem) return item.image;
    if (item is ArticleItem) return item.image;
    return '';
  }

  String _metaOf(dynamic item) {
    if (item is JobItem) {
      return [item.org, timeAgo(item.date)]
          .where((e) => e.isNotEmpty)
          .join(' • ');
    }
    if (item is MockTest) {
      return '${item.totalQ} Q • ${timeAgo(item.date)}';
    }
    if (item is ArticleItem) {
      return [item.category, timeAgo(item.date)]
          .where((e) => e.isNotEmpty)
          .join(' • ');
    }
    return '';
  }

  BookmarkEntry _bookmarkOf(dynamic item) {
    if (item is JobItem) {
      return BookmarkEntry(
        kind: 'job',
        id: item.id,
        title: item.title,
        image: item.image,
        ts: DateTime.now(),
      );
    }
    if (item is MockTest) {
      return BookmarkEntry(
        kind: 'test',
        id: item.id,
        title: item.title,
        image: '',
        ts: DateTime.now(),
      );
    }
    final a = item as ArticleItem;
    return BookmarkEntry(
      kind: 'article',
      id: a.id,
      title: a.title,
      image: a.image,
      ts: DateTime.now(),
    );
  }
}

class _Chip {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _Chip(this.label, this.icon, this.onTap);
}
