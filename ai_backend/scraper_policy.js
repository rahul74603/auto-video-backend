"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SCRAPER_AGE_DAYS = 10;

function toTimestamp(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isWithinScraperWindow(value, { now = Date.now(), maxAgeDays = MAX_SCRAPER_AGE_DAYS } = {}) {
  const publishedAt = toTimestamp(value);
  if (!publishedAt || publishedAt > now) return false;
  return publishedAt >= now - maxAgeDays * DAY_MS;
}

function compareNewestFirst(a, b, getPublishedAt = (item) => item && item.publishedAt) {
  return toTimestamp(getPublishedAt(b)) - toTimestamp(getPublishedAt(a));
}

// 🚫 INTERVIEW-ONLY detection — walk-in / direct-interview / interview-EVENT
// notices block hote hain, par genuine vacancy (exam+interview wali) KABHI
// skip nahi hoti. Walk-in links bhi title ke bina detect hote hain.
function isInterviewNotice(title, link = "") {
  const titleText = String(title || "").toLowerCase();
  const linkText = String(link || "").toLowerCase();
  const text = `${titleText} ${linkText}`;

  // Walk-in/direct-interview roles are the interview-only cases explicitly
  // excluded by policy. Keep the link check for walk-in URLs whose title omits it.
  if (/walk[\s_\-]*in/.test(text)) return true;

  const hasVacancySignal = /recruit|vacan|online[\s_\-]*form|apply|advertis|bharti|भर्ती|पद|रिक्त|\bposts?\b/.test(titleText);
  const hasExamSelection = /written|competitive|entrance|prelim|mains?|exam|test|परीक्षा/.test(titleText);
  if (/direct[\s_\-]*interview/.test(titleText) && !(hasVacancySignal && hasExamSelection)) return true;

  const hasInterview = /interview|साक्षात्कार/.test(titleText);
  if (!hasInterview) return false;

  const isInterviewEvent = /(?:interview|साक्षात्कार).{0,35}(?:schedul|date|call[\s_\-]*letter|admit[\s_\-]*card|result|list|venue|slot|shortlist|programme|program|तिथि|सूची|कार्यक्रम|प्रवेश पत्र|कॉल लेटर)|(?:schedul|date|call[\s_\-]*letter|admit[\s_\-]*card|result|list|venue|slot|shortlist).{0,35}(?:interview|साक्षात्कार)/.test(titleText);

  // A real recruitment/vacancy is never discarded merely because selection
  // includes an interview. Only a clearly event-only interview notice is blocked.
  if (hasVacancySignal && !isInterviewEvent) return false;
  if (isInterviewEvent) return true;
  return true; // bare interview/sाक्षात्कार notice without an application vacancy
}

const GOVERNMENT_SIGNALS = [
  /\b(government|govt|sarkari|public sector|psu|central government|state government|union government)\b/i,
  /\b(SSC|UPSC|RRB|RRC|IBPS|RBI|SBI|LIC|ESIC|EPFO|ISRO|DRDO|BARC|ONGC|NTPC|BHEL|IOCL|BSNL|BEL|GAIL|HPCL|BPCL|NHPC|NLC|HAL|AAI|FCI|DVC|NPCIL|SJVN|NHM|AIIMS|ICMR|NVS|KVS)\b/i,
  /\b(central bank of india|bank of india|punjab national bank|bank of baroda|canara bank|union bank of india|indian bank|uco bank|bank of maharashtra|punjab and sind bank)\b/i,
  /\.gov\.in\b|\.nic\.in\b/i,
  /\b(railways?|police|armed forces|army|navy|air force|defen[cs]e|ministry|commission|municipal corporation|high court|supreme court|district court)\b/i,
  /\b(department of|government of india|govt\. of india|state public service commission|public service commission)\b/i,
];

function isGovernmentJob({ title = "", organization = "", sourceText = "", officialUrl = "" } = {}) {
  const text = [title, organization, sourceText, officialUrl].filter(Boolean).join(" ");
  return GOVERNMENT_SIGNALS.some((pattern) => pattern.test(text));
}

function classifyJobSource(details = {}) {
  return isGovernmentJob(details) ? "government" : "private";
}

function isHighQualityPrivateJob(job, score, minimumScore = 9) {
  const requiredFacts = [
    job && job.organization,
    job && job.qualification,
    job && job.vacancies,
    job && job.salary,
    job && job.startDate,
    job && job.lastDate,
  ];
  const hasOfficialLink = Boolean(job && (job.officialSiteLink || job.notificationLink));
  return score >= minimumScore && requiredFacts.every((value) => String(value || "").trim()) && hasOfficialLink;
}

module.exports = {
  DAY_MS,
  MAX_SCRAPER_AGE_DAYS,
  toTimestamp,
  isWithinScraperWindow,
  compareNewestFirst,
  isInterviewNotice,
  isGovernmentJob,
  classifyJobSource,
  isHighQualityPrivateJob,
};
