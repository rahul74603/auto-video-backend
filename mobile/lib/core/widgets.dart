import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/models.dart';
import '../data/user_store.dart';
import 'theme.dart';

/// Release CI --dart-define=APP_VERSION se set hota hai (About screen).
const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.2.0');

/// Har jagah same loading / error / empty / image / tile.

class LoadingView extends StatelessWidget {
  final String label;
  const LoadingView({super.key, this.label = 'Loading...'});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 12),
          Text(label),
        ],
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorView({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              FilledButton.tonal(onPressed: onRetry, child: const Text('Retry')),
            ],
          ],
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  final String message;
  const EmptyView({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.inbox_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

/// Cache wali image + designed brand cover (khali/toota URL ab
/// placeholder nahi, ek pehchan-wala cover dikhta hai).
class ThumbImage extends StatelessWidget {
  final String? url;
  final double height;
  final double? width;
  final double radius;
  final IconData icon;
  const ThumbImage({
    super.key,
    required this.url,
    this.height = 120,
    this.width,
    this.radius = 12,
    this.icon = Icons.image_outlined,
  });

  @override
  Widget build(BuildContext context) {
    final u = (url ?? '').trim();
    Widget cover() => _CoverArt(height: height, width: width, icon: icon);

    if (u.isEmpty || !(u.startsWith('http://') || u.startsWith('https://'))) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: cover(),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: CachedNetworkImage(
        imageUrl: u,
        height: height,
        width: width ?? double.infinity,
        fit: BoxFit.cover,
        placeholder: (_, __) => cover(),
        errorWidget: (_, __, ___) => cover(),
      ),
    );
  }
}

/// Brand cover art — gradient + frosted icon + halki sajawat.
/// Chhoti size (tile) par sirf icon, badi par wordmark bhi.
class _CoverArt extends StatelessWidget {
  final double height;
  final double? width;
  final IconData icon;
  const _CoverArt({required this.height, required this.width, required this.icon});

  @override
  Widget build(BuildContext context) {
    final big = height >= 88;
    return Container(
      height: height,
      width: width ?? double.infinity,
      decoration: const BoxDecoration(gradient: brandGradient),
      child: Stack(
        children: [
          // Halki badi icon sajawat (neeche-dayein, kata hua)
          Positioned(
            right: -14,
            bottom: -18,
            child: Icon(
              icon,
              size: height * 0.95,
              color: Colors.white.withOpacity(0.10),
            ),
          ),
          Center(
            child: Container(
              padding: EdgeInsets.all(big ? 11 : 7),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.18),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withOpacity(0.25)),
              ),
              child: Icon(
                icon,
                size: big ? 24 : 17,
                color: Colors.white,
              ),
            ),
          ),
          if (big)
            const Positioned(
              left: 10,
              bottom: 8,
              child: Text(
                'STUDYGYAAN',
                style: TextStyle(
                  color: Color(0xC7FFFFFF),
                  fontSize: 8.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 2.2,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Chhota label chip — card ke cover par (category / PREMIUM).
class CoverBadge extends StatelessWidget {
  final String label;
  final bool accent;
  const CoverBadge({super.key, required this.label, this.accent = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3.5),
      decoration: BoxDecoration(
        color: accent ? AppTheme.accent : Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        label.toUpperCase(),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: accent ? const Color(0xFF451A03) : Colors.white,
          fontSize: 9.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String title;
  final IconData? icon;
  final VoidCallback? onSeeAll;
  const SectionHeader({super.key, required this.title, this.icon, this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 8, 10),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 19,
            decoration: BoxDecoration(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 17.5,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
          ),
          if (onSeeAll != null)
            InkWell(
              onTap: onSeeAll,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'See all',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: scheme.primary,
                      ),
                    ),
                    Icon(Icons.chevron_right, size: 17, color: scheme.primary),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// List tile: chhoti image + title + subtitle + date (+ optional trailing).
class ContentTile extends StatelessWidget {
  final String? image;
  final String title;
  final String subtitle;
  final String date;
  final Widget? trailing;
  final VoidCallback onTap;
  final IconData icon;
  final String? badge;
  const ContentTile({
    super.key,
    required this.image,
    required this.title,
    required this.subtitle,
    required this.date,
    required this.onTap,
    this.trailing,
    this.icon = Icons.image_outlined,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ThumbImage(url: image, height: 78, width: 78, radius: 12, icon: icon),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (badge != null && badge!.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: scheme.primary.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          badge!.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.6,
                            color: scheme.primary,
                          ),
                        ),
                      ),
                      const SizedBox(height: 5),
                    ],
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    if (date.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            Icons.schedule_outlined,
                            size: 12.5,
                            color: scheme.outline,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            date,
                            style: TextStyle(
                              fontSize: 12,
                              color: scheme.outline,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}

/// Bahar ka link (browser/YouTube) — kharab URL pe SnackBar, crash nahi.
Future<void> openExternal(BuildContext context, String? url) async {
  final u = (url ?? '').trim();
  final uri = Uri.tryParse(u);
  if (u.isEmpty || uri == null || !uri.hasScheme) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Link uplabdh nahi hai')),
      );
    }
    return;
  }
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Link khol nahi paya')),
    );
  }
}

/// Bookmark toggle — provider se. (home + content + bookmarks sab use karte hain.)
class BookmarkButton extends StatelessWidget {
  final BookmarkEntry entry;
  const BookmarkButton({super.key, required this.entry});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<UserStore>();
    final saved = store.isBookmarked(entry.kind, entry.id);
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.45),
        borderRadius: BorderRadius.circular(20),
      ),
      child: IconButton(
        iconSize: 18,
        padding: const EdgeInsets.all(7),
        constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
        icon: Icon(
          saved ? Icons.bookmark : Icons.bookmark_border,
          color: saved ? AppTheme.accent : Colors.white,
        ),
        onPressed: () => store.toggleBookmark(entry),
      ),
    );
  }
}
