import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/models.dart';
import '../data/user_store.dart';

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
            const Icon(Icons.cloud_off_outlined, size: 48),
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
            const Icon(Icons.inbox_outlined, size: 48),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

/// Cache wali image + gradient fallback (khali/toota URL ab sundar dikhta hai).
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
    Widget fallback() {
      final scheme = Theme.of(context).colorScheme;
      return Container(
        height: height,
        width: width ?? double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [scheme.primary, scheme.tertiary],
          ),
        ),
        child: Icon(icon, size: height * 0.4, color: Colors.white),
      );
    }

    if (u.isEmpty || !(u.startsWith('http://') || u.startsWith('https://'))) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: fallback(),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: CachedNetworkImage(
        imageUrl: u,
        height: height,
        width: width ?? double.infinity,
        fit: BoxFit.cover,
        placeholder: (_, __) => fallback(),
        errorWidget: (_, __, ___) => fallback(),
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 8, 8),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(
              icon,
              size: 20,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ),
          if (onSeeAll != null)
            TextButton(onPressed: onSeeAll, child: const Text('See all')),
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
  const ContentTile({
    super.key,
    required this.image,
    required this.title,
    required this.subtitle,
    required this.date,
    required this.onTap,
    this.trailing,
    this.icon = Icons.image_outlined,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ThumbImage(url: image, height: 76, width: 76, radius: 10, icon: icon),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      date,
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
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
        color: Colors.black45,
        borderRadius: BorderRadius.circular(20),
      ),
      child: IconButton(
        icon: Icon(
          saved ? Icons.bookmark : Icons.bookmark_border,
          color: Colors.white,
        ),
        onPressed: () => store.toggleBookmark(entry),
      ),
    );
  }
}
