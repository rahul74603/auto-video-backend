<?php
/**
 * meta.php — 🤖 BOT SEO RENDERER v2 (StudyGyaan, 100% free — koi Google service nahi)
 * =================================================================================
 * .htaccess SAB crawlers (Googlebot, Bingbot, AhrefsSiteAudit, Semrush, WhatsApp,
 * Facebook, Telegram...) ko yahan bhejta hai. Ye file GitHub Actions ke banaye
 * seo-meta-*.json se turant clean static HTML deta hai — ZERO JavaScript:
 *
 *   - /job/...       → poora article + JobPosting + FAQ schema (Google Jobs ready!)
 *   - /update/...    → poora article + NewsArticle + FAQ schema
 *   - /blog|/test|/course|/material|/web-stories/... → per-page title/desc/canonical
 *   - listing pages  → /govt-jobs, /exam-calendar, hub pages etc. (seo-meta-pages.json)
 *   - baaki          → title/description/image preview
 *
 * Health-Score fix pack (Ahrefs):
 *   - Har URL ka sahi canonical + meta description (missing-description fix)
 *   - Real 404 for deleted/unknown detail URLs (soft-404 fix)
 *   - Footer/header me internal links har page pe (orphan + no-outgoing-links fix)
 *   - JSON-LD me </script> breakout escape (broken-JS fix)
 *   - Corrupt/missing JSON pe 5xx nahi — graceful fallback
 *
 * Normal users kabhi yahan nahi aate — unhe React app milti hai.
 */

$SITE = 'https://studygyaan.in';
$DEFAULT_TITLE = 'StudyGyaan - Sarkari Naukri, Mock Tests & Free Study Material';
$DEFAULT_DESC = 'Latest Govt Jobs, Free Mock Tests, Study Material, Fast Track Updates aur Exam Preparation - sab kuch free, StudyGyaan par.';
$DEFAULT_IMG = $SITE . '/og-image.jpg';

// ---------- path nikalo ----------
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
// Hindi/unicode slugs percent-encoded aate hain — JSON keys raw UTF-8 me hain
$uri = urldecode($uri ?? '/');
$path = rtrim($uri, '/');
if ($path === '' || $path === '') $path = '/';
// double slashes normalize
$path = preg_replace('#/{2,}#', '/', $path);
if ($path === '') $path = '/';

$segments = array_values(array_filter(explode('/', trim($path, '/')), function ($s) { return $s !== ''; }));
$first = strtolower($segments[0] ?? '');
$isDetail = count($segments) >= 2 && trim($segments[1]) !== '';

// ---------- Legacy/alias paths → 301 canonical path ----------
// (Ahrefs/Google ke liye duplicate URL paths ek canonical URL pe consolidate)
$redirectMap = [
    'fasttrack'       => 'update',
    'fast-track'      => 'update',
    'updates'         => 'update',
    'blogs'           => 'blog',
    'tests'           => 'test',
    'mock-test'       => 'test',
    'mock-tests'      => 'test',
    'courses'         => 'course',
    'materials'       => 'material',
    'study-material'  => 'material',
    'study-materials' => 'material',
    'web-story'       => 'web-stories',
    'story'           => 'web-stories',
    'stories'         => 'web-stories',
];
if (isset($redirectMap[$first])) {
    $newSegments = array_merge([$redirectMap[$first]], array_slice($segments, 1));
    header('Location: ' . $SITE . '/' . implode('/', $newSegments), true, 301);
    exit;
}

// ---------- collection aliases → kaunsi JSON file ----------
// 'job' = detail (jobs json) | 'jobs' = hub pages (pages json) — dono alag hain!
$detailAlias = [
    'job'             => 'jobs',
    'update'          => 'updates',
    'blog'            => 'pages',
    'test'            => 'pages',
    'course'          => 'pages',
    'ebook'           => 'pages',
    'pdf'             => 'pages',
    'material'        => 'pages',
    'web-stories'     => 'pages',
];

$entry = null;
if ($isDetail && isset($detailAlias[$first])) {
    $kind = $detailAlias[$first];
    $file = $kind === 'jobs'
        ? __DIR__ . '/seo-meta-jobs.json'
        : ($kind === 'updates' ? __DIR__ . '/seo-meta-updates.json' : __DIR__ . '/seo-meta-pages.json');
} else {
    // listing / static pages bhi pages JSON me se mil sakti hain (/govt-jobs, /exam-calendar...)
    $file = __DIR__ . '/seo-meta-pages.json';
}

if ($file && is_readable($file)) {
    $raw = file_get_contents($file);
    $data = $raw ? json_decode($raw, true) : null;
    if (is_array($data)) {
        $entry = $data[$path] ?? null;
    }
    // corrupt/empty JSON → $entry null hi rahega, 5xx nahi aayega
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
if (!$entry && $isDetail && isset($detailAlias[$first])) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store, max-age=0');
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
header('Cache-Control: public, max-age=300');
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
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="alternate" type="application/rss+xml" title="StudyGyaan RSS" href="<?= $h($SITE) ?>/rss.xml">
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
<?php foreach ($ld as $schema): ?>
<script type="application/ld+json"><?= json_encode($schema, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?></script>
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
<footer>
  <p><strong>StudyGyaan — Free Exam Preparation</strong></p>
  <p>
    <a href="<?= $h($SITE) ?>">Home</a> |
    <a href="<?= $h($SITE) ?>/govt-jobs">Latest Govt Jobs</a> |
    <a href="<?= $h($SITE) ?>/exam-calendar">Exam Calendar</a> |
    <a href="<?= $h($SITE) ?>/results">Results</a> |
    <a href="<?= $h($SITE) ?>/admit-card">Admit Cards</a> |
    <a href="<?= $h($SITE) ?>/answer-key">Answer Keys</a> |
    <a href="<?= $h($SITE) ?>/syllabus">Syllabus</a>
  </p>
  <p>
    <a href="<?= $h($SITE) ?>/test">Free Mock Tests</a> |
    <a href="<?= $h($SITE) ?>/blog">Blog</a> |
    <a href="<?= $h($SITE) ?>/web-stories">Web Stories</a> |
    <a href="<?= $h($SITE) ?>/free-study-material">Free Study Material</a> |
    <a href="<?= $h($SITE) ?>/e-books">E-Books</a> |
    <a href="<?= $h($SITE) ?>/premium-notes">Premium Notes</a> |
    <a href="<?= $h($SITE) ?>/tools">Sarkari Tools</a>
  </p>
  <p>
    <a href="<?= $h($SITE) ?>/jobs/10th-pass">10th Pass Jobs</a> |
    <a href="<?= $h($SITE) ?>/jobs/12th-pass">12th Pass Jobs</a> |
    <a href="<?= $h($SITE) ?>/jobs/graduate">Graduate Jobs</a> |
    <a href="<?= $h($SITE) ?>/jobs/railway">Railway Jobs</a> |
    <a href="<?= $h($SITE) ?>/jobs/ssc">SSC Jobs</a> |
    <a href="<?= $h($SITE) ?>/jobs/banking">Bank Jobs</a> |
    <a href="<?= $h($SITE) ?>/jobs/police">Police Jobs</a>
  </p>
  <p>&copy; StudyGyaan.in — Sarkari Naukri &amp; Exam Preparation</p>
</footer>
</body>
</html>
