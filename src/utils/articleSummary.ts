export type DraftSummaryInput = {
  preferred?: unknown;
  articleHtml?: unknown;
  title?: unknown;
  organization?: unknown;
  category?: unknown;
  updateDate?: unknown;
  vacancies?: unknown;
  lastDate?: unknown;
  qualification?: unknown;
  kind: 'job' | 'fast_track';
};

const HTML_ENTITY_MAP: Readonly<Record<string, string>> = Object.freeze({
  '&nbsp;': ' ',
  '&#160;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
});

function decodeEntities(value: string): string {
  return value.replace(/&(?:nbsp|amp|quot|apos|lt|gt|#39|#160);/gi, (entity) =>
    HTML_ENTITY_MAP[entity.toLowerCase()] ?? entity
  );
}

function textOnly(value: unknown): string {
  return decodeEntities(String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function trimSummary(value: string, maxLength = 360): string {
  if (value.length <= maxLength) return value;
  const cutoff = value.lastIndexOf(' ', maxLength - 1);
  return `${value.slice(0, cutoff > 80 ? cutoff : maxLength).trim()}…`;
}

function articleExcerpt(html: unknown): string {
  const paragraphs = [...String(html ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => textOnly(match[1]))
    .filter((paragraph) => paragraph.length >= 25);
  const excerpt = trimSummary(paragraphs.slice(0, 2).join(' '));
  if (excerpt) return excerpt;
  return trimSummary(textOnly(html));
}

export function buildDraftDescription(input: DraftSummaryInput): string {
  const preferred = textOnly(input.preferred);
  if (preferred.length >= 30) return trimSummary(preferred);

  const fromArticle = articleExcerpt(input.articleHtml);
  if (fromArticle.length >= 30) return fromArticle;

  const title = textOnly(input.title);
  if (!title) return '';

  if (input.kind === 'fast_track') {
    const context = [input.organization, input.category, input.updateDate]
      .map(textOnly)
      .filter(Boolean)
      .join(' · ');
    return trimSummary(`${title} se judi ${context ? `${context} ki ` : ''}latest update. Official source par poori jankari aur agle steps verify karein.`);
  }

  const details = [
    input.organization ? `Organization: ${textOnly(input.organization)}` : '',
    input.vacancies ? `Vacancies: ${textOnly(input.vacancies)}` : '',
    input.lastDate ? `Last date: ${textOnly(input.lastDate)}` : '',
    input.qualification ? `Qualification: ${textOnly(input.qualification)}` : '',
  ].filter(Boolean).join(' · ');
  return trimSummary(`${title} se judi job notification. ${details ? `${details}. ` : ''}Apply karne se pehle official notification me eligibility aur dates verify karein.`);
}
