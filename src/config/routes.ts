/**
 * routes.ts — ️ CENTRALIZED ROUTE CONSTANTS
 * ===========================================
 * HAR route yahan se aayega — hardcoded URLs NO MORE.
 * Isse 1,668 non-canonical pages aur 409 4XX pages fix honge.
 * 
 * Usage:
 *   import { ROUTES } from '@/config/routes';
 *   <Link to={ROUTES.job(slug)}>Job Details</Link>
 */

export const ROUTES = {
  //  Home
  home: '/',

  //  Jobs
  govtJobs: '/govt-jobs',
  job: (slug: string) => `/job/${slug}`,
  
  // 🎯 Job Hubs (Category pages)
  jobHub: (slug: string) => `/jobs/${slug}`,
  examCalendar: '/exam-calendar',

  // 📝 Blog
  blog: '/blog',
  blogPost: (slug: string) => `/blog/${slug}`,

  // 🧪 Mock Tests
  mockTests: '/test',
  mockTest: (slug: string) => `/test/${slug}`,

  //  Study Material
  studyMaterial: '/free-study-material',
  material: (slug: string) => `/material/${slug}`,
  pdf: (slug: string) => `/pdf/${slug}`,

  // 📖 E-Books
  ebooks: '/e-books',
  ebook: (slug: string) => `/ebook/${slug}`,

  // 💎 Premium
  premiumNotes: '/premium-notes',
  shop: '/premium-notes',

  // 🎓 Courses
  myCourses: '/my-courses',
  course: (slug: string) => `/course/${slug}`,

  // 📱 Web Stories
  webStories: '/web-stories',
  webStory: (slug: string) => `/web-stories/${slug}`,

  // ⚡ Fast Track / Updates
  fastTrack: '/update',
  update: (slug: string) => `/update/${slug}`,

  // Legal
  privacyPolicy: '/privacy-policy',
  termsConditions: '/terms-conditions',
  refundCancellation: '/refund-cancellation-policy',
  shippingPolicy: '/shipping-policy',
  contactUs: '/contact-us',
  aboutUs: '/about-us',
  disclaimer: '/disclaimer',

  // 🔧 Tools
  tools: 'https://studygyaan.in/tools/',

  // 🔒 Admin
  admin: '/secret-admin',
  adminBlogWriter: '/write-blog-secret',
  adminJobDrafts: '/admin/job-drafts',
  adminStories: '/admin-stories-secret',
  adminBrowse: '/admin/browse',

  // 💳 Payment
  manualPayment: '/manual-payment',
  success: '/success',
  redirect: '/redirect',
} as const;

/**
 * Legacy URL redirects — in URLs ko canonical URLs me convert karo
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/jobs/': '/job/',
  '/blogs/': '/blog/',
  '/mock-tests/': '/test/',
  '/fasttrack/': '/update/',
  '/free-study-material/': '/material/',
  '/e-book/': '/ebook/',
  '/about': '/about-us',
  '/contact': '/contact-us',
  '/refund-policy': '/refund-cancellation-policy',
};

/**
 * Check if a URL is a legacy URL that needs redirect
 */
export function isLegacyUrl(url: string): boolean {
  return Object.keys(LEGACY_REDIRECTS).some(legacy => 
    url.startsWith(legacy)
  );
}

/**
 * Convert legacy URL to canonical URL
 */
export function toCanonicalUrl(url: string): string {
  let canonical = url;
  
  for (const [legacy, replacement] of Object.entries(LEGACY_REDIRECTS)) {
    if (canonical.startsWith(legacy)) {
      canonical = `${replacement}${canonical.slice(legacy.length)}`;
      break;
    }
  }
  
  return canonical;
}

/**
 * Validate internal link — returns true if link is valid
 */
export function isValidInternalLink(url: string): boolean {
  if (!url) return false;
  
  // External links are valid
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true;
  }
  
  // Internal links must start with /
  if (!url.startsWith('/')) {
    return false;
  }
  
  // Check for common invalid patterns
  const invalidPatterns = [
    /\/\//,  // Double slashes
    /\/$/,   // Trailing slash (except root)
    /\s/,    // Spaces
  ];
  
  return !invalidPatterns.some(pattern => pattern.test(url));
}

/**
 * Get route from slug and type
 */
export function getRoute(type: 'job' | 'blog' | 'test' | 'material' | 'ebook' | 'course' | 'update' | 'webStory', slug: string): string {
  switch (type) {
    case 'job': return ROUTES.job(slug);
    case 'blog': return ROUTES.blogPost(slug);
    case 'test': return ROUTES.mockTest(slug);
    case 'material': return ROUTES.material(slug);
    case 'ebook': return ROUTES.ebook(slug);
    case 'course': return ROUTES.course(slug);
    case 'update': return ROUTES.update(slug);
    case 'webStory': return ROUTES.webStory(slug);
    default: return '#';
  }
}
