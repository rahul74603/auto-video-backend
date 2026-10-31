import 'package:flutter/material.dart';

import '../core/widgets.dart';
import '../data/admin_repo.dart';
import '../data/models.dart';
import 'admin_edit.dart';

/// Website review-queue tabs ka mobile mirror:
/// AI Drafts · Job Drafts · Fast Track Drafts · Payment Desk.

// ---------------- AI DRAFTS ----------------

class AIDraftsScreen extends StatefulWidget {
  const AIDraftsScreen({super.key});

  @override
  State<AIDraftsScreen> createState() => _AIDraftsScreenState();
}

class _AIDraftsScreenState extends State<AIDraftsScreen> {
  String _filter = 'all';
  String? _busyId;

  bool _matchF(AIDraft d, String f) {
    final published = d.status == 'published';
    switch (f) {
      case 'passed':
        return !published && !d.reviewStale && d.reviewStatus == 'passed';
      case 'failed':
        return !published && (d.reviewStatus == 'failed' || d.reviewStale);
      case 'published':
        return published;
      default:
        return true;
    }
  }

  bool _match(AIDraft d) => _matchF(d, _filter);

  Future<void> _publish(AIDraft d) async {
    if (_busyId != null) return;
    setState(() => _busyId = d.id);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final fresh = await AdminRepo.fetchAIDraft(d.id);
      if (!mounted) return;
      if (fresh == null) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Draft nahi mila')),
        );
        return;
      }
      if (fresh.status == 'published') {
        messenger.showSnackBar(
          const SnackBar(content: Text('Ye draft pehle se published hai')),
        );
        return;
      }
      final gate = AdminRepo.canPublishAIDraft(fresh);
      var adminOverride = false;
      if (!gate.ok) {
        final yes = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('ADMIN VERIFIED publish?'),
            content: Text(
              '${gate.reason}\n\nTumne khud verify kiya hai — phir bhi publish karein?\n"${fresh.title}"',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Rahne do'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Publish'),
              ),
            ],
          ),
        );
        if (yes != true || !mounted) return;
        adminOverride = true;
      } else {
        final yes = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Publish karein?'),
            content: Text('"${fresh.title}"'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Rahne do'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Publish'),
              ),
            ],
          ),
        );
        if (yes != true || !mounted) return;
      }
      final res = await AdminRepo.publishAIDraft(
        fresh,
        adminOverride: adminOverride,
      );
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Published → ${res.collection}/${res.docId}'
            '${res.originDeleted ? ' (origin cleaned)' : ''}',
          ),
          duration: const Duration(seconds: 5),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(e is StateError ? e.message : 'Publish fail: $e'),
        ),
      );
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _delete(AIDraft d) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete draft?'),
        content: Text('"${d.title}"'),
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
    if (yes != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.deleteAIDraft(d.id);
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('Delete fail: $e')));
      return;
    }
    if (!mounted) return;
    messenger.showSnackBar(const SnackBar(content: Text('Draft deleted')));
  }

  Widget _badge(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: fg),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review AI Drafts')),
      body: StreamBuilder<List<AIDraft>>(
        stream: AdminRepo.streamAIDrafts(),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final all = snap.data ?? [];
          final items = all.where(_match).toList();
          const filters = {
            'all': 'All',
            'passed': 'Ready',
            'failed': 'Failed',
            'published': 'Published',
          };
          return Column(
            children: [
              SizedBox(
                height: 48,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  itemCount: filters.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final f = filters.keys.elementAt(i);
                    final n = all.where((d) => _matchF(d, f)).length;
                    return ChoiceChip(
                      label: Text('${filters[f]} ($n)'),
                      selected: _filter == f,
                      onSelected: (_) => setState(() => _filter = f),
                    );
                  },
                ),
              ),
              Expanded(
                child: items.isEmpty
                    ? const EmptyView(message: 'Koi draft nahi hai')
                    : ListView.builder(
                        itemCount: items.length,
                        itemBuilder: (context, i) {
                          final d = items[i];
                          final published = d.status == 'published';
                          final passed = !published &&
                              !d.reviewStale &&
                              d.reviewStatus == 'passed';
                          final failed = !published &&
                              (d.reviewStatus == 'failed' || d.reviewStale);
                          return Card(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 6,
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    d.title.isEmpty ? '(bina title)' : d.title,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: [
                                      _badge(
                                        d.type == 'JOB' ? 'JOB' : 'FAST TRACK',
                                        Colors.blue.shade100,
                                        Colors.blue.shade900,
                                      ),
                                      if (published)
                                        _badge(
                                          'PUBLISHED',
                                          Colors.grey.shade300,
                                          Colors.black87,
                                        )
                                      else if (d.reviewStale)
                                        _badge(
                                          'STALE',
                                          Colors.amber.shade200,
                                          Colors.brown,
                                        )
                                      else if (passed)
                                        _badge(
                                          'PASSED',
                                          Colors.green.shade100,
                                          Colors.green.shade900,
                                        )
                                      else if (failed)
                                        _badge(
                                          'FAILED',
                                          Colors.red.shade100,
                                          Colors.red.shade900,
                                        )
                                      else
                                        _badge(
                                          'REVIEW',
                                          Colors.purple.shade100,
                                          Colors.purple.shade900,
                                        ),
                                      _badge(
                                        'Score ${d.score}',
                                        Colors.grey.shade200,
                                        Colors.black87,
                                      ),
                                      _badge(
                                        '${d.wordCount} words',
                                        Colors.grey.shade200,
                                        Colors.black87,
                                      ),
                                    ],
                                  ),
                                  if (d.issues.isNotEmpty) ...[
                                    const SizedBox(height: 6),
                                    Text(
                                      d.issues.first,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Colors.red,
                                      ),
                                    ),
                                  ],
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      OutlinedButton(
                                        onPressed: () =>
                                            Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => AIEditScreen(
                                              draft: d,
                                            ),
                                          ),
                                        ),
                                        child: const Text('Edit'),
                                      ),
                                      const SizedBox(width: 8),
                                      FilledButton(
                                        onPressed: _busyId != null
                                            ? null
                                            : () => _publish(d),
                                        child: Text(
                                          _busyId == d.id
                                              ? '...'
                                              : 'Publish',
                                        ),
                                      ),
                                      const Spacer(),
                                      IconButton(
                                        icon: const Icon(
                                          Icons.delete_outline,
                                          color: Colors.red,
                                        ),
                                        onPressed: () => _delete(d),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------- JOB DRAFTS ----------------

class JobDraftsScreen extends StatelessWidget {
  const JobDraftsScreen({super.key});

  static const _fetchUrl =
      'https://github.com/rahul74603/auto-video-backend/actions/workflows/govt_jobs_scraper.yml';

  Future<void> _queueAI(
    BuildContext context,
    Map<String, dynamic> m,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.queueJobAI(str(m['id']), m);
    } catch (_) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Queue nahi ho paya')),
      );
      return;
    }
    if (!context.mounted) return;
    messenger.showSnackBar(
      const SnackBar(
        content: Text('AI queue me! Agli run me full article banega'),
        duration: Duration(seconds: 5),
      ),
    );
  }

  Future<void> _delete(
    BuildContext context,
    Map<String, dynamic> m,
  ) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete draft?'),
        content: Text('"${str(m['title'])}"'),
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
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.deleteJobDraft(str(m['id']));
    } catch (_) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Delete nahi ho paya')),
      );
      return;
    }
    if (!context.mounted) return;
    messenger.showSnackBar(const SnackBar(content: Text('Draft deleted')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Job Drafts')),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: AdminRepo.streamJobDrafts(),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items = snap.data ?? [];
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${items.length} drafts review ke liye',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: () {
                        openExternal(context, _fetchUrl);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'GitHub Actions khula — Run workflow dabao, 2-3 min me drafts aayenge',
                            ),
                            duration: Duration(seconds: 6),
                          ),
                        );
                      },
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Fetch new'),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: items.isEmpty
                    ? const EmptyView(message: 'Koi draft pending nahi')
                    : ListView.builder(
                        itemCount: items.length,
                        itemBuilder: (context, i) {
                          final m = items[i];
                          final desc = str(m['description']);
                          final ago = timeAgo(tsDate(m['createdAt']));
                          return Card(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 6,
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    str(m['title']).isEmpty
                                        ? '(bina title)'
                                        : str(m['title']),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    [
                                      str(m['organization']).isEmpty
                                          ? 'StudyGyaan AI'
                                          : str(m['organization']),
                                      str(m['category']).isEmpty
                                          ? 'Latest Job'
                                          : str(m['category']),
                                      ago,
                                    ].where((e) => e.isNotEmpty).join(' • '),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    desc.isEmpty
                                        ? 'Description blank hai'
                                        : desc,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: desc.isEmpty
                                          ? Colors.amber.shade800
                                          : null,
                                      fontWeight: desc.isEmpty
                                          ? FontWeight.bold
                                          : null,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      OutlinedButton.icon(
                                        onPressed: () => _queueAI(context, m),
                                        icon: const Icon(
                                          Icons.auto_fix_high,
                                          size: 16,
                                        ),
                                        label: const Text('AI Article'),
                                      ),
                                      const SizedBox(width: 8),
                                      FilledButton(
                                        onPressed: () =>
                                            Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => JobEditScreen(
                                              doc: m,
                                              isDraft: true,
                                            ),
                                          ),
                                        ),
                                        child: const Text('Review'),
                                      ),
                                      const Spacer(),
                                      IconButton(
                                        icon: const Icon(
                                          Icons.delete_outline,
                                          color: Colors.red,
                                        ),
                                        onPressed: () => _delete(context, m),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------- FT DRAFTS ----------------

class FTDraftsScreen extends StatelessWidget {
  const FTDraftsScreen({super.key});

  Future<void> _approve(
    BuildContext context,
    Map<String, dynamic> m,
  ) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Publish karein?'),
        content: Text('"${str(m['title'])}"'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Rahne do'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
    if (yes != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.approveFT(str(m['id']));
    } catch (_) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Approve fail hua')),
      );
      return;
    }
    if (!context.mounted) return;
    messenger.showSnackBar(
      const SnackBar(content: Text('Published! Site + Telegram pe chala gaya.')),
    );
  }

  Future<void> _delete(
    BuildContext context,
    Map<String, dynamic> m,
  ) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete draft?'),
        content: Text('"${str(m['title'])}"'),
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
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.deleteFT(str(m['id']));
    } catch (_) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Delete fail hua')),
      );
      return;
    }
    if (!context.mounted) return;
    messenger.showSnackBar(const SnackBar(content: Text('Draft deleted')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fast Track Drafts')),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: AdminRepo.streamFTDrafts(),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items = snap.data ?? [];
          if (items.isEmpty) {
            return const EmptyView(
              message: 'Koi draft pending nahi — scraper chalne par aayenge',
            );
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final m = items[i];
              final ago = timeAgo(tsDate(m['createdAt']));
              return Card(
                margin: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        str(m['title']).isEmpty
                            ? '(bina title)'
                            : str(m['title']),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        [
                          str(m['category']).isEmpty
                              ? 'update'
                              : str(m['category']),
                          ago,
                        ].where((e) => e.isNotEmpty).join(' • '),
                        style: const TextStyle(fontSize: 12),
                      ),
                      if (str(m['shortInfo']).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          str(m['shortInfo']),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          FilledButton(
                            onPressed: () => _approve(context, m),
                            child: const Text('Approve'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => FTEditScreen(doc: m),
                              ),
                            ),
                            child: const Text('Edit'),
                          ),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(
                              Icons.delete_outline,
                              color: Colors.red,
                            ),
                            onPressed: () => _delete(context, m),
                          ),
                        ],
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

// ---------------- PAYMENTS ----------------

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  String? _busyId;

  Future<void> _act(PaymentReq req, bool approve) async {
    if (_busyId != null) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(approve ? 'Approve payment?' : 'Reject payment?'),
        content: Text('${req.userEmail}\nRs ${req.amount} — ${req.itemName.isEmpty ? req.itemId : req.itemName}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Rahne do'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(approve ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    if (approve && (req.userId.isEmpty || req.itemId.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Payment data incomplete (user/item missing).'),
        ),
      );
      return;
    }
    setState(() => _busyId = req.id);
    final messenger = ScaffoldMessenger.of(context);
    try {
      if (approve) {
        await AdminRepo.approvePayment(
          requestId: req.id,
          userId: req.userId,
          itemId: req.itemId,
        );
      } else {
        await AdminRepo.rejectPayment(req.id);
      }
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Action fail hua')),
      );
      return;
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
    if (!mounted) return;
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          approve ? 'Payment Approved! Course unlocked.' : 'Payment Rejected.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment Desk')),
      body: StreamBuilder<List<PaymentReq>>(
        stream: AdminRepo.streamPendingPayments(),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(message: 'Load nahi hua: ${snap.error}');
          }
          final items = snap.data ?? [];
          if (items.isEmpty) {
            return const EmptyView(
              message: 'All Clear! No Pending Payments.',
            );
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final req = items[i];
              final busy = _busyId == req.id;
              return Card(
                margin: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.amber.shade100,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'AWAITING APPROVAL',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Colors.amber.shade900,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            timeAgo(req.date),
                            style: const TextStyle(fontSize: 11),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        req.userEmail.isEmpty ? '(no email)' : req.userEmail,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'UTR: ${req.utr.isEmpty ? 'User ne nahi diya' : req.utr}',
                        style: const TextStyle(fontSize: 13),
                      ),
                      Text(
                        'Rs ${req.amount.isEmpty ? '?' : req.amount}',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                      Text(
                        'Item: ${req.itemName.isEmpty ? req.itemId : req.itemName}',
                        style: const TextStyle(fontSize: 13),
                      ),
                      const SizedBox(height: 8),
                      InkWell(
                        onTap: req.screenshotUrl.isEmpty
                            ? null
                            : () => openExternal(context, req.screenshotUrl),
                        child: ThumbImage(
                          url: req.screenshotUrl,
                          height: 140,
                          icon: Icons.receipt_long,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _busyId != null
                                  ? null
                                  : () => _act(req, false),
                              child: Text(
                                busy ? '...' : 'Reject',
                                style: const TextStyle(color: Colors.red),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: FilledButton(
                              onPressed: _busyId != null
                                  ? null
                                  : () => _act(req, true),
                              child: Text(busy ? '...' : 'Approve'),
                            ),
                          ),
                        ],
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
