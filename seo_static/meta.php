<?php
/**
 * meta.php — 🤖 BOT SEO RENDERER (StudyGyaan, 100% free — koi Google service nahi)
 * =================================================================================
 * .htaccess bots (Googlebot, WhatsApp, Facebook, Telegram...) ko yahan bhejta hai.
 * Ye file GitHub Actions ke banaye seo-meta-*.json se turant HTML deta hai:
 *   - /job/...    → poora article + JobPosting + FAQ schema (Google Jobs ready!)
 *   - /update/... → poora article + NewsArticle + FAQ schema
 *   - baaki       → title/description/image preview (WhatsApp/FB cards)
 *
 * Normal users kabhi yahan nahi aate — unhe React app milti hai.
 */

$SITE = 'https://studygyaan.in';
$DEFAULT_TITLE = 'StudyGyaan - Sarkari Naukri, Mock Tests & Free Study Material';
$DEFAULT_DESC = 'Latest Govt Jobs, Free Mock Tests, Study Material, Fast Track Updates aur Exam Preparation - sab kuch free, StudyGyaan par.';
$DEFAULT_IMG = $SITE . '/og-image.jpg';

// ---------- path nikalo ----------
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = rtrim($uri, '/');
if ($path === '') $path = '/';

// ---------- sahi JSON file chuno ----------
$file = null;
if (preg_match('#^/job/#', $path)) {
    $file = __DIR__ . '/seo-meta-jobs.json';
} elseif (preg_match('#^/update/#', $path)) {
    $file = __DIR__ . '/seo-meta-updates.json';
} else {
    $file = __DIR__ . '/seo-meta-pages.json';
}

$entry = null;
if ($file && is_readable($file)) {
    $data = json_decode(file_get_contents($file), true);
    if (is_array($data)) {
        $entry = $data[$path] ?? null;
    }
}

// ---------- values ----------
$title = $entry['t'] ?? $DEFAULT_TITLE;
$desc = $entry['d'] ?? $DEFAULT_DESC;
$img = $entry['img'] ?? $DEFAULT_IMG;
$ogType = $entry['type'] ?? 'website';
$canonical = $SITE . ($path === '/' ? '' : $path);
$content = $entry['content'] ?? '';
$ld = $entry['ld'] ?? [];

$h = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };

// 🛑 SOFT-404 KILLER: content-detail URL hai lekin data me entry NAHI —
// matlab ye page exist hi nahi karta (deleted/galat slug). Bots ko asli 404 do
// taaki Google "Soft 404" / "Duplicate canonical" me na phansaye.
$isDetailPath = preg_match('#^/(job|update|blog|test|course|material|web-stories)/[^/]+#', $path) === 1;
if (!$entry && $isDetailPath) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    ?>
<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<title>404 - Page Not Found | StudyGyaan</title>
<meta name="robots" content="noindex, nofollow">
</head>
<body>
<h1>404 — Ye page maujood nahi hai</h1>
<p><a href="<?= $h($SITE) ?>">StudyGyaan.in Home</a> | <a href="<?= $h($SITE) ?>/govt-jobs">Latest Govt Jobs</a></p>
</body>
</html>
    <?php
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=1800');
if (!$entry) { http_response_code(200); } // homepage/listing → generic meta, 200
?>
<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $h($title) ?></title>
<meta name="description" content="<?= $h($desc) ?>">
<link rel="canonical" href="<?= $h($canonical) ?>">
<meta property="og:site_name" content="StudyGyaan">
<meta property="og:type" content="<?= $h($ogType) ?>">
<meta property="og:title" content="<?= $h($title) ?>">
<meta property="og:description" content="<?= $h($desc) ?>">
<meta property="og:url" content="<?= $h($canonical) ?>">
<meta property="og:image" content="<?= $h($img) ?>">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= $h($title) ?>">
<meta name="twitter:description" content="<?= $h($desc) ?>">
<meta name="twitter:image" content="<?= $h($img) ?>">
<meta name="robots" content="index, follow">
<?php foreach ($ld as $schema): ?>
<script type="application/ld+json"><?= json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
<?php endforeach; ?>
</head>
<body>
<header>
  <a href="<?= $h($SITE) ?>"><strong>StudyGyaan</strong></a> —
  <a href="<?= $h($SITE) ?>/govt-jobs">Govt Jobs</a> |
  <a href="<?= $h($SITE) ?>/test">Mock Tests</a> |
  <a href="<?= $h($SITE) ?>/blog">Blog</a> |
  <a href="<?= $h($SITE) ?>/web-stories">Web Stories</a>
</header>
<main>
<article>
<h1><?= $h($title) ?></h1>
<?php if ($content): ?>
<?= $content /* hamara apna Firestore article HTML — trusted */ ?>
<?php else: ?>
<p><?= $h($desc) ?></p>
<?php endif; ?>
<p><a href="<?= $h($canonical) ?>">Read on StudyGyaan.in →</a></p>
</article>
</main>
<footer><p>&copy; StudyGyaan.in — Sarkari Naukri &amp; Exam Preparation</p></footer>
</body>
</html>
