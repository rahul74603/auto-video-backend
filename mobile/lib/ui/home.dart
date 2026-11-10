import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/auth.dart';
import '../data/models.dart';
import '../data/repository.dart';
import 'content.dart';
import 'quiz.dart';

/// Home: brand header + welcome hero + quick chips + latest strips
/// (Fast Track sabse pehle). 2026-11-10 professional redesign —
/// sirf dikhawa badla hai, data/navigation/bookmark logic waisa hi.
class HomeScreen extends StatelessWidget {
  final void Function(int) onSeeAll;
  const HomeScreen({super.key, required this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const _BrandTitle(),
        titleSpacing: 16,
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 8),
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

  // ---------- Header / hero / chips ----------

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
    final photo = (user?.photoURL ?? '').trim();
    final initials = firstName.isNotEmpty
        ? firstName.substring(0, 1).toUpperCase()
        : 'SG';
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      decoration: BoxDecoration(
        gradient: brandGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brand.withOpacity(0.35),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          children: [
            Positioned(
              right: -26,
              top: -30,
              child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.10),
                ),
              ),
            ),
            Positioned(
              right: 34,
              bottom: -38,
              child: Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.08),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white.withOpacity(0.22),
                    backgroundImage:
                        photo.isNotEmpty ? NetworkImage(photo) : null,
                    child: photo.isEmpty
                        ? Text(
                            initials,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          hello,
                          style: const TextStyle(
                            fontSize: 17.5,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          sub,
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.white.withOpacity(0.85),
                            height: 1.35,
                          ),
                        ),
                      ],
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
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        itemCount: chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final chip = chips[i];
          return Material(
            color: scheme.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: scheme.outlineVariant),
            ),
            child: InkWell(
              onTap: chip.onTap,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(
                        color: scheme.primary.withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(chip.icon, size: 15, color: scheme.primary),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      chip.label,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
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
  }

  // ---------- Content strips ----------

  Widget _strip<T>({
    required IconData icon,
    required Stream<List<T>> stream,
    required void Function(T) onTap,
  }) {
    return StreamBuilder<List<T>>(
      stream: stream,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const _StripSkeleton();
        }
        if (snap.hasError || !(snap.hasData && snap.data!.isNotEmpty)) {
          return const SizedBox(
            height: 60,
            child: EmptyView(message: 'Abhi kuch nahi — thodi der me dekho'),
          );
        }
        final items = snap.data!;
        return SizedBox(
          height: 212,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, i) {
              final item = items[i];
              final title = _titleOf(item);
              final image = _imageOf(item);
              final meta = _metaOf(item);
              final meta2 = _meta2Of(context, item);
              final badge = _badgeOf(item);
              final bm = _bookmarkOf(item);
              return SizedBox(
                width: 232,
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
                              height: 104,
                              radius: 0,
                              icon: icon,
                            ),
                            if (badge != null)
                              Positioned(
                                left: 8,
                                top: 8,
                                child: badge,
                              ),
                            Positioned(
                              right: 6,
                              top: 6,
                              child: BookmarkButton(entry: bm),
                            ),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(11, 9, 11, 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  height: 1.28,
                                ),
                              ),
                              const SizedBox(height: 4),
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
                              if (meta2 != null) ...[
                                const SizedBox(height: 3),
                                meta2,
                              ],
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

  /// Dusri meta line — job par posts + last date (sabse kaam ki jaankari),
  /// test par samay + exam, article par author.
  Widget? _meta2Of(BuildContext context, dynamic item) {
    final soft = Theme.of(context).colorScheme.onSurfaceVariant;
    Widget line(IconData icon, String text,
        {Color? color, bool bold = false, double maxW = 196}) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color ?? soft),
          const SizedBox(width: 4),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxW),
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
                color: color ?? soft,
              ),
            ),
          ),
        ],
      );
    }

    if (item is JobItem) {
      final parts = <Widget>[];
      final vac = item.vacancies.trim();
      if (vac.isNotEmpty) {
        parts.add(line(Icons.people_outline, '$vac Posts', maxW: 92));
      }
      final last = item.lastDate.trim();
      if (last.isNotEmpty) {
        if (parts.isNotEmpty) parts.add(const SizedBox(width: 10));
        parts.add(line(
          Icons.event_outlined,
          last,
          color: const Color(0xFFDC2626),
          bold: true,
          maxW: 96,
        ));
      }
      if (parts.isEmpty) return null;
      return Row(mainAxisSize: MainAxisSize.min, children: parts);
    }
    if (item is MockTest) {
      final bits = <String>[];
      if (item.durationMin > 0) bits.add('${item.durationMin} min');
      if (item.exam.trim().isNotEmpty) bits.add(item.exam.trim());
      if (bits.isEmpty) return null;
      return line(Icons.timer_outlined, bits.join(' • '));
    }
    if (item is ArticleItem) {
      final author = item.author.trim();
      if (author.isEmpty) return null;
      return line(Icons.person_outline, author);
    }
    return null;
  }

  /// Cover ke upar ka chhota badge — job/article par category,
  /// premium test par PREMIUM (amber).
  Widget? _badgeOf(dynamic item) {
    if (item is MockTest && item.premium) {
      return const CoverBadge(label: 'Premium', accent: true);
    }
    String cat = '';
    if (item is JobItem) cat = item.category.trim();
    if (item is ArticleItem) cat = item.category.trim();
    if (item is MockTest) cat = item.category.trim();
    if (cat.isEmpty) return null;
    return CoverBadge(label: cat);
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

/// App bar ki brand pehchan — website wala bolt logo + naam.
class _BrandTitle extends StatelessWidget {
  const _BrandTitle();

  @override
  Widget build(BuildContext context) {
    final ink = Theme.of(context).colorScheme.onSurface;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            gradient: brandGradient,
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.bolt, color: Colors.white, size: 20),
        ),
        const SizedBox(width: 10),
        RichText(
          text: TextSpan(
            style: TextStyle(
              fontSize: 20.5,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
              color: ink,
            ),
            children: const [
              TextSpan(text: 'Study'),
              TextSpan(
                text: 'Gyaan',
                style: TextStyle(color: AppTheme.brand),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Loading ke samay spinner ki jagah card-jaisi khaali aakriti —
/// professional apps aise hi dikhte hain.
class _StripSkeleton extends StatelessWidget {
  const _StripSkeleton();

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).colorScheme.surfaceContainerHighest;
    Widget block(double w, double h, [double r = 8]) {
      return Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          color: base,
          borderRadius: BorderRadius.circular(r),
        ),
      );
    }

    return SizedBox(
      height: 212,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: 3,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, __) => SizedBox(
          width: 232,
          child: Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(11),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  block(210, 92, 10),
                  const SizedBox(height: 12),
                  block(190, 13),
                  const SizedBox(height: 7),
                  block(150, 13),
                  const SizedBox(height: 10),
                  block(110, 11),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Chip {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _Chip(this.label, this.icon, this.onTap);
}
