import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/widgets.dart';
import '../data/admin_repo.dart';
import '../data/models.dart';
import '../data/repository.dart';
import 'admin_edit.dart';
import 'admin_lists.dart';

/// Website admin (src/pages/Admin) ka mobile mirror — Review Queue
/// (AI/Job/FT drafts + approval), Payment Desk, Published manage.

/// Admin allowlist — sirf in logins ko Admin panel dikhega.
const Set<String> adminEmails = {'rahulkumar74603@gmail.com'};

bool isAdminEmail(String? email) {
  final e = (email ?? '').trim().toLowerCase();
  return e.isNotEmpty && adminEmails.contains(e);
}

class _Col {
  final String label;
  final String name;
  final IconData icon;
  const _Col(this.label, this.name, this.icon);
}

class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  static const _published = [
    _Col('Fast Track', Repo.updates, Icons.bolt),
    _Col('Govt Jobs', Repo.jobs, Icons.work),
    _Col('Blogs', Repo.blogs, Icons.article),
    _Col('Mock Tests', Repo.tests, Icons.quiz),
    _Col('Stories', Repo.stories, Icons.auto_stories),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin Panel')),
      body: ListView(
        children: [
          _sectionTitle('Review Queue'),
          _countTile(
            context,
            icon: Icons.psychology_outlined,
            label: 'Review AI Drafts',
            future: AdminRepo.countAIPending(),
            suffix: 'pending',
            screen: const AIDraftsScreen(),
          ),
          _countTile(
            context,
            icon: Icons.work_outline,
            label: 'Job Drafts',
            future: AdminRepo.countAll(AdminRepo.jobDrafts),
            suffix: 'drafts',
            screen: const JobDraftsScreen(),
          ),
          _countTile(
            context,
            icon: Icons.bolt_outlined,
            label: 'Fast Track Drafts',
            future: AdminRepo.countWhere(AdminRepo.fastTrack, 'status', 'draft'),
            suffix: 'pending',
            screen: const FTDraftsScreen(),
          ),
          _sectionTitle('Payments'),
          _countTile(
            context,
            icon: Icons.payments_outlined,
            label: 'Payment Desk',
            future: AdminRepo.countWhere(
              AdminRepo.purchases,
              'status',
              'pending',
            ),
            suffix: 'pending',
            screen: const PaymentsScreen(),
          ),
          _sectionTitle('Published Content'),
          for (final c in _published)
            _countTile(
              context,
              icon: c.icon,
              label: c.label,
              future: Repo.count(c.name),
              suffix: 'items',
              screen: AdminListScreen(
                collection: c.name,
                title: c.label,
              ),
            ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Text(
              'Badlav website par bhi turant dikhenge. '
              'AI-draft publish wahi gate follow karta hai jo website par hai.',
              style: TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        title,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _countTile(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Future<int> future,
    required String suffix,
    required Widget screen,
  }) {
    return FutureBuilder<int>(
      future: future,
      builder: (context, snap) {
        final n = snap.data;
        return ListTile(
          leading: Icon(icon),
          title: Text(label),
          subtitle: Text(n == null ? '...' : '$n $suffix'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => screen),
          ),
        );
      },
    );
  }
}

/// Ek collection ke naye items + actions (popup menu).
class AdminListScreen extends StatelessWidget {
  final String collection;
  final String title;
  const AdminListScreen({
    super.key,
    required this.collection,
    required this.title,
  });

  bool get _editable =>
      collection == Repo.jobs || collection == Repo.updates;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: StreamBuilder<List<AdminDoc>>(
        stream: Repo.streamAdmin(collection, 30),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items = snap.data ?? [];
          if (items.isEmpty) {
            return const EmptyView(message: 'Koi item nahi hai');
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final d = items[i];
              final hidden = !visibleStatus(d.status);
              final ago = timeAgo(d.date);
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: ListTile(
                  leading: Icon(
                    hidden ? Icons.visibility_off : Icons.visibility,
                    color: hidden
                        ? Colors.orange
                        : Theme.of(context).colorScheme.primary,
                  ),
                  title: Text(
                    d.title.isEmpty ? '(bina title)' : d.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    [
                      d.status.isEmpty ? 'published' : d.status,
                      ago,
                    ].where((e) => e.isNotEmpty).join(' • '),
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (v) => _act(context, v, d),
                    itemBuilder: (_) => [
                      if (_editable)
                        const PopupMenuItem(
                          value: 'edit',
                          child: Text('Edit'),
                        ),
                      PopupMenuItem(
                        value: hidden ? 'show' : 'hide',
                        child: Text(hidden ? 'Publish karo' : 'Hide karo'),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Text(
                          'Delete',
                          style: TextStyle(color: Colors.red),
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

  Future<void> _act(BuildContext context, String action, AdminDoc doc) async {
    if (action == 'edit') {
      await _edit(context, doc);
      return;
    }
    if (action == 'delete') {
      final yes = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Delete?'),
          content: Text('"${doc.title}" hamesha ke liye delete ho jayega.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Rahne do'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete'),
            ),
          ],
        ),
      );
      if (yes != true || !context.mounted) return;
      await _run(
        context,
        'Delete ho gaya',
        () => Repo.adminDelete(collection, doc.id),
      );
    } else if (action == 'hide') {
      await _run(
        context,
        'Hide ho gaya (website se bhi gaya)',
        () => Repo.adminSetStatus(collection, doc.id, 'archived'),
      );
    } else {
      await _run(
        context,
        'Publish ho gaya',
        () => Repo.adminSetStatus(collection, doc.id, 'published'),
      );
    }
  }

  Future<void> _edit(BuildContext context, AdminDoc doc) async {
    final messenger = ScaffoldMessenger.of(context);
    Map<String, dynamic>? full;
    try {
      full = await AdminRepo.fetchDoc(collection, doc.id);
    } catch (_) {
      full = null;
    }
    if (!context.mounted) return;
    if (full == null) {
      messenger.showSnackBar(const SnackBar(content: Text('Doc nahi mila')));
      return;
    }
    final data = full;
    if (collection == Repo.jobs) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => JobEditScreen(doc: data, isDraft: false),
        ),
      );
    } else {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => FTEditScreen(doc: data)),
      );
    }
  }

  Future<void> _run(
    BuildContext context,
    String okMsg,
    Future<void> Function() fn,
  ) async {
    try {
      await fn();
    } on FirebaseException catch (e) {
      if (!context.mounted) return;
      if (e.code == 'permission-denied') {
        await showDialog(
          context: context,
          builder: (_) => RulesFixDialog(collection: collection),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fail: ${e.message ?? e.code}')),
        );
      }
      return;
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Fail: $e')),
      );
      return;
    }
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(okMsg)),
    );
  }
}

/// Rules me admin-write allow karne ka snippet (permission-denied pe).
class RulesFixDialog extends StatelessWidget {
  final String collection;
  const RulesFixDialog({super.key, required this.collection});

  String get _snippet =>
      '// Firebase console → Firestore Database → Rules,\n'
      '// rules ke andar ye block add karo:\n'
      'match /$collection/{doc} {\n'
      '  allow read: if true;\n'
      '  allow update, delete: if request.auth != null\n'
      "    && request.auth.token.email == '${adminEmails.first}';\n"
      '}';

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Permission chahiye'),
      content: SingleChildScrollView(
        child: SelectableText(
          _snippet,
          style: const TextStyle(fontSize: 12),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: _snippet));
            Navigator.of(context).pop();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Copy ho gaya — Rules me paste karo')),
            );
          },
          child: const Text('Copy'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Band karo'),
        ),
      ],
    );
  }
}
