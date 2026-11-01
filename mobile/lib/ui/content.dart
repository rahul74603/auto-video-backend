import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:share_plus/share_plus.dart';

import '../core/widgets.dart';
import '../data/models.dart';
import '../data/repository.dart';

enum ContentKind { blog, update, job }

extension ContentKindX on ContentKind {
  String get collection {
    switch (this) {
      case ContentKind.blog:
        return Repo.blogs;
      case ContentKind.update:
        return Repo.updates;
      case ContentKind.job:
        return Repo.jobs;
    }
  }

  String get title {
    switch (this) {
      case ContentKind.blog:
        return 'Blogs';
      case ContentKind.update:
        return 'Fast Track';
      case ContentKind.job:
        return 'Govt Jobs';
    }
  }

  String get sitePath {
    switch (this) {
      case ContentKind.blog:
        return 'blog';
      case ContentKind.update:
        return 'update';
      case ContentKind.job:
        return 'job';
    }
  }
}

// ---------------- LIST ----------------

class ContentListScreen extends StatelessWidget {
  final ContentKind kind;
  const ContentListScreen({super.key, required this.kind});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(kind.title)),
      body: kind == ContentKind.job ? _jobList() : _articleList(),
    );
  }

  Widget _articleList() {
    return StreamBuilder<List<ArticleItem>>(
      stream: Repo.streamLatest(kind.collection, 50, ArticleItem.fromDoc),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const LoadingView();
        }
        if (snap.hasError) {
          return ErrorView(message: 'Load nahi hua: ${snap.error}');
        }
        final items = snap.data ?? [];
        if (items.isEmpty) {
          return const EmptyView(message: 'Abhi kuch nahi hai');
        }
        return ListView.builder(
          itemCount: items.length,
          itemBuilder: (context, i) {
            final a = items[i];
            return ContentTile(
              image: a.image,
              title: a.title,
              subtitle: a.category,
              date: timeAgo(a.date),
              trailing: BookmarkButton(
                entry: BookmarkEntry(
                  kind: kind == ContentKind.blog ? 'blog' : 'update',
                  id: a.id,
                  title: a.title,
                  image: a.image,
                  ts: DateTime.now(),
                ),
              ),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ArticleScreen(kind: kind, id: a.id),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _jobList() {
    return StreamBuilder<List<JobItem>>(
      stream: Repo.streamLatest(Repo.jobs, 50, JobItem.fromDoc),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const LoadingView();
        }
        if (snap.hasError) {
          return ErrorView(message: 'Load nahi hua: ${snap.error}');
        }
        final items = snap.data ?? [];
        if (items.isEmpty) {
          return const EmptyView(message: 'Abhi koi job nahi hai');
        }
        return ListView.builder(
          itemCount: items.length,
          itemBuilder: (context, i) {
            final j = items[i];
            return ContentTile(
              image: j.image,
              title: j.title,
              subtitle: j.org,
              date: j.lastDate.isNotEmpty
                  ? 'Last date: ${j.lastDate}'
                  : timeAgo(j.date),
              trailing: BookmarkButton(
                entry: BookmarkEntry(
                  kind: 'job',
                  id: j.id,
                  title: j.title,
                  image: j.image,
                  ts: DateTime.now(),
                ),
              ),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => JobDetailScreen(id: j.id)),
              ),
            );
          },
        );
      },
    );
  }
}

// ---------------- ARTICLE DETAIL (blog / update) ----------------

class ArticleScreen extends StatelessWidget {
  final ContentKind kind;
  final String id;
  const ArticleScreen({super.key, required this.kind, required this.id});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(kind.title)),
      body: FutureBuilder<ArticleItem?>(
        future: Repo.getDoc(kind.collection, id, ArticleItem.fromDoc),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError || snap.data == null) {
            return const ErrorView(message: 'Ye page nahi khula');
          }
          return _body(context, snap.data!);
        },
      ),
    );
  }

  Widget _body(BuildContext context, ArticleItem a) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (a.image.isNotEmpty) ThumbImage(url: a.image, height: 200),
        const SizedBox(height: 12),
        Text(
          a.title,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        Text(
          [a.category, a.author, timeAgo(a.date)]
              .where((e) => e.isNotEmpty)
              .join(' • '),
          style: TextStyle(color: Theme.of(context).colorScheme.outline),
        ),
        const SizedBox(height: 12),
        if (a.html.isNotEmpty)
          Html(
            data: a.html,
            onLinkTap: (url, _, __) {
              openExternal(context, url);
            },
          )
        else if (a.excerpt.isNotEmpty)
          Text(
            a.excerpt,
            style: const TextStyle(fontSize: 16, height: 1.6),
          ),
        if (a.videoId.isNotEmpty) ...[
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => openExternal(
              context,
              'https://www.youtube.com/watch?v=${a.videoId}',
            ),
            icon: const Icon(Icons.play_circle_outline),
            label: const Text('Video dekho'),
          ),
        ],
        for (final l in a.links) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => openExternal(context, l.url),
            icon: const Icon(Icons.open_in_new),
            label: Text(l.label.isEmpty ? 'Link kholo' : l.label),
          ),
        ],
        if (a.faqs.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Text(
            'FAQs',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          for (final f in a.faqs)
            ExpansionTile(
              title: Text(f.q),
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(f.a),
                  ),
                ),
              ],
            ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => Share.share(
                  '${a.title}\nhttps://studygyaan.in',
                  subject: a.title,
                ),
                icon: const Icon(Icons.share),
                label: const Text('Share'),
              ),
            ),
            const SizedBox(width: 12),
            BookmarkButton(
              entry: BookmarkEntry(
                kind: kind == ContentKind.blog ? 'blog' : 'update',
                id: id,
                title: a.title,
                image: a.image,
                ts: DateTime.now(),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ---------------- JOB DETAIL ----------------

class JobDetailScreen extends StatelessWidget {
  final String id;
  const JobDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Job Details')),
      body: FutureBuilder<JobItem?>(
        future: Repo.getDoc(Repo.jobs, id, JobItem.fromDoc),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError || snap.data == null) {
            return const ErrorView(message: 'Ye job nahi khuli');
          }
          return _body(context, snap.data!);
        },
      ),
    );
  }

  Widget _body(BuildContext context, JobItem j) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (j.image.isNotEmpty) ThumbImage(url: j.image, height: 180),
        const SizedBox(height: 12),
        Text(
          j.title,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        Text(
          [j.org, j.category, timeAgo(j.date)]
              .where((e) => e.isNotEmpty)
              .join(' • '),
          style: TextStyle(color: Theme.of(context).colorScheme.outline),
        ),
        const SizedBox(height: 12),
        _infoCard(context, j),
        if (j.applyLink.isNotEmpty) ...[
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => openExternal(context, j.applyLink),
            icon: const Icon(Icons.how_to_reg),
            label: const Text('Apply Online'),
          ),
        ],
        if (j.notifLink.isNotEmpty) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => openExternal(context, j.notifLink),
            icon: const Icon(Icons.picture_as_pdf_outlined),
            label: const Text('Notification PDF'),
          ),
        ],
        if (j.siteLink.isNotEmpty) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => openExternal(context, j.siteLink),
            icon: const Icon(Icons.language),
            label: const Text('Official Website'),
          ),
        ],
        if (j.videoId.isNotEmpty) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => openExternal(
              context,
              'https://www.youtube.com/watch?v=${j.videoId}',
            ),
            icon: const Icon(Icons.play_circle_outline),
            label: const Text('Video dekho'),
          ),
        ],
        if (j.html.isNotEmpty) ...[
          const SizedBox(height: 16),
          Html(
            data: j.html,
            onLinkTap: (url, _, __) {
              openExternal(context, url);
            },
          ),
        ],
        if (j.faqs.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Text(
            'FAQs',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          for (final f in j.faqs)
            ExpansionTile(
              title: Text(f.q),
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(f.a),
                  ),
                ),
              ],
            ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => Share.share(
                  '${j.title}\nhttps://studygyaan.in',
                  subject: j.title,
                ),
                icon: const Icon(Icons.share),
                label: const Text('Share'),
              ),
            ),
            const SizedBox(width: 12),
            BookmarkButton(
              entry: BookmarkEntry(
                kind: 'job',
                id: id,
                title: j.title,
                image: j.image,
                ts: DateTime.now(),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _infoCard(BuildContext context, JobItem j) {
    final rows = <String, String>{
      'Organization': j.org,
      'Vacancies': j.vacancies,
      'Qualification': j.qualification,
      'Salary': j.salary,
      'Location': j.location,
      'Last Date': j.lastDate,
      'Exam Date': j.examDate,
    }..removeWhere((_, v) => v.isEmpty);
    if (rows.isEmpty) return const SizedBox.shrink();
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            for (final e in rows.entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 110,
                      child: Text(
                        e.key,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        e.value,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------- STORIES ----------------

class StoriesScreen extends StatelessWidget {
  const StoriesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Web Stories')),
      body: StreamBuilder<List<StoryItem>>(
        stream: Repo.streamLatest(Repo.stories, 40, StoryItem.fromDoc),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items =
              (snap.data ?? []).where((s) => s.pages.isNotEmpty).toList();
          if (items.isEmpty) {
            return const EmptyView(message: 'Abhi koi story nahi hai');
          }
          return GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.72,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: items.length,
            itemBuilder: (context, i) {
              final s = items[i];
              return Card(
                margin: EdgeInsets.zero,
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => StoryViewerScreen(story: s),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: ThumbImage(url: s.poster, height: 300)),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          s.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class StoryViewerScreen extends StatefulWidget {
  final StoryItem story;
  const StoryViewerScreen({super.key, required this.story});

  @override
  State<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends State<StoryViewerScreen> {
  late final PageController _controller;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = widget.story.pages;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('${_index + 1} / ${pages.length}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: (_index + 1) / pages.length,
            backgroundColor: Colors.white24,
          ),
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: pages.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) => _page(context, pages[i]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _page(BuildContext context, StoryPage p) {
    return Stack(
      fit: StackFit.expand,
      children: [
        if (p.image.isNotEmpty)
          CachedNetworkImage(
            imageUrl: p.image,
            fit: BoxFit.cover,
            placeholder: (_, __) => Container(color: Colors.grey[900]),
            errorWidget: (_, __, ___) => Container(color: Colors.grey[900]),
          )
        else
          Container(color: const Color(0xFF1E3A8A)),
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.black87],
            ),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: 32,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (p.heading.isNotEmpty)
                Text(
                  p.heading,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              if (p.text.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  p.text,
                  style: const TextStyle(color: Colors.white70, fontSize: 16),
                ),
              ],
              if (p.ctaLink.isNotEmpty) ...[
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => openExternal(context, p.ctaLink),
                  child: Text(
                    p.ctaText.isEmpty ? 'Aur padho' : p.ctaText,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------- VIDEOS ----------------

class VideosScreen extends StatelessWidget {
  const VideosScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Videos')),
      body: FutureBuilder<List<VideoItem>>(
        future: Repo.fetchVideos(),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items = snap.data ?? [];
          if (items.isEmpty) {
            return const EmptyView(message: 'Abhi koi video nahi hai');
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final v = items[i];
              return ContentTile(
                image: v.thumb,
                title: v.title,
                subtitle: v.source,
                date: timeAgo(v.date),
                trailing: BookmarkButton(
                  entry: BookmarkEntry(
                    kind: 'video',
                    id: v.videoId,
                    title: v.title,
                    image: v.thumb,
                    ts: DateTime.now(),
                  ),
                ),
                onTap: () => openExternal(context, v.watchUrl),
              );
            },
          );
        },
      ),
    );
  }
}
