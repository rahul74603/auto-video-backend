import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/widgets.dart';
import '../data/auth.dart';
import '../data/messaging.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../data/user_store.dart';
import 'content.dart';
import 'quiz.dart';

// ---------------- MENU ----------------

class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final store = context.watch<UserStore>();
    return Scaffold(
      appBar: AppBar(title: const Text('Menu')),
      body: ListView(
        children: [
          _profileHeader(context, auth),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.ondemand_video_outlined),
            title: const Text('Videos'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const VideosScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.bookmark_outline),
            title: const Text('Bookmarks'),
            trailing: Text('${store.bookmarks.length}'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const BookmarkScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.history),
            title: const Text('Test History'),
            trailing: Text('${store.history.length}'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const HistoryScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.notifications_outlined),
            title: const Text('Notifications'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotifScreen()),
            ),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.share_outlined),
            title: const Text('Share App'),
            onTap: () => Share.share(
              'StudyGyaan — Free Govt Jobs, Mock Tests, Blogs: https://studygyaan.in',
            ),
          ),
          ListTile(
            leading: const Icon(Icons.language),
            title: const Text('Website kholo'),
            onTap: () => openExternal(context, 'https://studygyaan.in'),
          ),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('About'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AboutScreen()),
            ),
          ),
          if (auth.loggedIn)
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.red),
              title: const Text(
                'Logout',
                style: TextStyle(color: Colors.red),
              ),
              onTap: () => auth.signOut(),
            ),
        ],
      ),
    );
  }

  Widget _profileHeader(BuildContext context, AuthService auth) {
    final user = auth.user;
    if (user == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Login karo',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const Text('Bookmarks + test history har device pe sync hogi'),
            const SizedBox(height: 12),
            if (auth.error != null) ...[
              Text(
                auth.error!,
                style: const TextStyle(color: Colors.red),
              ),
              const SizedBox(height: 8),
            ],
            FilledButton.icon(
              onPressed: auth.busy
                  ? null
                  : () async {
                      final ok = await context
                          .read<AuthService>()
                          .signInWithGoogle();
                      if (ok && context.mounted) {
                        final uid = context.read<AuthService>().user?.uid;
                        if (uid != null) {
                          MessagingService.saveToken(uid);
                        }
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Login ho gaya!')),
                        );
                      }
                    },
              icon: auth.busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.login),
              label: const Text('Google se Login'),
            ),
          ],
        ),
      );
    }
    final photo = user.photoURL ?? '';
    final name = (user.displayName ?? '').isEmpty
        ? (user.email ?? 'Student')
        : user.displayName!;
    return ListTile(
      contentPadding: const EdgeInsets.all(16),
      leading: CircleAvatar(
        radius: 26,
        backgroundImage: photo.isNotEmpty ? NetworkImage(photo) : null,
        child: photo.isEmpty ? Text(name[0].toUpperCase()) : null,
      ),
      title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text(user.email ?? ''),
    );
  }
}

// ---------------- BOOKMARKS ----------------

class BookmarkScreen extends StatelessWidget {
  const BookmarkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final items = context.watch<UserStore>().bookmarks;
    return Scaffold(
      appBar: AppBar(title: const Text('Bookmarks')),
      body: items.isEmpty
          ? const EmptyView(message: 'Abhi kuch save nahi — bookmark dabao!')
          : ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, i) {
                final b = items[i];
                return ContentTile(
                  image: b.image,
                  title: b.title,
                  subtitle: b.kind,
                  date: timeAgo(b.ts),
                  trailing: BookmarkButton(entry: b),
                  onTap: () => _open(context, b),
                );
              },
            ),
    );
  }

  Future<void> _open(BuildContext context, BookmarkEntry b) async {
    switch (b.kind) {
      case 'blog':
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ArticleScreen(kind: ContentKind.blog, id: b.id),
          ),
        );
        return;
      case 'update':
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ArticleScreen(kind: ContentKind.update, id: b.id),
          ),
        );
        return;
      case 'job':
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => JobDetailScreen(id: b.id)),
        );
        return;
      case 'test':
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => TestInfoScreen(testId: b.id)),
        );
        return;
      case 'video':
        openExternal(context, 'https://www.youtube.com/watch?v=${b.id}');
        return;
      case 'story':
        break; // neeche fetch karke kholo
      default: // 'article' (purana) — blogs phir updates try karo
        break;
    }
    if (b.kind == 'story') {
      final s = await Repo.getDoc(Repo.stories, b.id, StoryItem.fromDoc);
      if (!context.mounted) return;
      if (s == null || s.pages.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ye story nahi khuli')),
        );
        return;
      }
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => StoryViewerScreen(story: s)),
      );
      return;
    }
    final blog = await Repo.getDoc(Repo.blogs, b.id, ArticleItem.fromDoc);
    if (!context.mounted) return;
    if (blog != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ArticleScreen(kind: ContentKind.blog, id: b.id),
        ),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ArticleScreen(kind: ContentKind.update, id: b.id),
      ),
    );
  }
}

// ---------------- HISTORY ----------------

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final items = context.watch<UserStore>().history;
    return Scaffold(
      appBar: AppBar(title: const Text('Test History')),
      body: items.isEmpty
          ? const EmptyView(message: 'Abhi koi test nahi diya')
          : ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, i) {
                final h = items[i];
                return ContentTile(
                  image: '',
                  title: h.title,
                  subtitle: 'Score ${h.score}/${h.total} • '
                      '${h.correct} sahi, ${h.wrong} galat',
                  date: timeAgo(h.ts),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => TestInfoScreen(testId: h.testId),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

// ---------------- NOTIFICATIONS ----------------

class NotifScreen extends StatefulWidget {
  const NotifScreen({super.key});

  @override
  State<NotifScreen> createState() => _NotifScreenState();
}

class _NotifScreenState extends State<NotifScreen> {
  Map<String, bool> _states = {};

  @override
  void initState() {
    super.initState();
    MessagingService.topicStates().then((m) {
      if (mounted) setState(() => _states = m);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: _states.isEmpty
          ? const LoadingView()
          : ListView(
              children: [
                for (final t in MessagingService.topics)
                  SwitchListTile(
                    title: Text(
                      MessagingService.topicLabels[t] ?? t,
                    ),
                    value: _states[t] ?? true,
                    onChanged: (on) async {
                      setState(() => _states[t] = on);
                      await MessagingService.setTopic(t, on);
                    },
                  ),
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Server-side alerts agle update me — tab tak topics ready hain.',
                  ),
                ),
              ],
            ),
    );
  }
}

// ---------------- ABOUT ----------------

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('About')),
      body: const Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'StudyGyaan App v1.0.0',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Text(
              'Free Govt Jobs, Mock Tests, Blogs, Stories aur Videos — '
              'website wala poora content, ab app me.\n\n'
              'Website: studygyaan.in',
              style: TextStyle(fontSize: 15, height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}
