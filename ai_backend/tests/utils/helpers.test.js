/**
 * Tests for shared helper/utility functions used across the backend.
 */

// =============================================================
// escapeXml — used in newsFeed.js and other modules
// =============================================================
function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

describe("escapeXml", () => {
  test("returns empty string for null/undefined input", () => {
    expect(escapeXml(null)).toBe("");
    expect(escapeXml(undefined)).toBe("");
    expect(escapeXml("")).toBe("");
  });

  test("escapes ampersands", () => {
    expect(escapeXml("A & B")).toBe("A &amp; B");
  });

  test("escapes less-than and greater-than", () => {
    expect(escapeXml("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes double quotes", () => {
    expect(escapeXml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  test("escapes single quotes", () => {
    expect(escapeXml("It's a test")).toBe("It&apos;s a test");
  });

  test("escapes all special characters together", () => {
    const input = '<a href="test" onclick=\'alert(1)\'>A & B</a>';
    const expected =
      "&lt;a href=&quot;test&quot; onclick=&apos;alert(1)&apos;&gt;A &amp; B&lt;/a&gt;";
    expect(escapeXml(input)).toBe(expected);
  });

  test("passes through normal text unchanged", () => {
    expect(escapeXml("Hello World")).toBe("Hello World");
  });

  test("passes through numbers", () => {
    expect(escapeXml("12345")).toBe("12345");
  });

  test("handles Hindi/Unicode text", () => {
    expect(escapeXml("नमस्ते")).toBe("नमस्ते");
  });
});

// =============================================================
// getUtcDate — used in newsFeed.js
// =============================================================
function getUtcDate(timeSource) {
  if (!timeSource) return new Date().toUTCString();
  try {
    const d = timeSource.toDate ? timeSource.toDate() : new Date(timeSource);
    return d.toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

describe("getUtcDate", () => {
  const fixedDate = new Date("2025-06-15T10:30:00Z");

  test("returns current UTC string when no argument provided", () => {
    const result = getUtcDate();
    expect(result).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
  });

  test("returns current UTC string when null", () => {
    const result = getUtcDate(null);
    expect(result).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
  });

  test("converts ISO date string to UTC string", () => {
    const result = getUtcDate("2025-06-15T10:30:00Z");
    expect(result).toBe("Sun, 15 Jun 2025 10:30:00 GMT");
  });

  test("converts Date object to UTC string", () => {
    const result = getUtcDate(fixedDate);
    expect(result).toBe("Sun, 15 Jun 2025 10:30:00 GMT");
  });

  test("handles Firestore Timestamp-like object with toDate method", () => {
    const timestamp = { toDate: () => fixedDate };
    const result = getUtcDate(timestamp);
    expect(result).toBe("Sun, 15 Jun 2025 10:30:00 GMT");
  });

  test("returns 'Invalid Date' for unparseable string input", () => {
    const result = getUtcDate("not-a-date");
    // new Date("not-a-date") creates an invalid Date, toUTCString() returns "Invalid Date"
    expect(result).toBe("Invalid Date");
  });
});

// =============================================================
// truncateText — used in web_stories.yml workflows and various modules
// =============================================================
function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + "...";
}

describe("truncateText", () => {
  test("returns empty string for null/undefined", () => {
    expect(truncateText(null, 10)).toBe("");
    expect(truncateText(undefined, 10)).toBe("");
  });

  test("returns text unchanged if shorter than maxLength", () => {
    expect(truncateText("Hello", 10)).toBe("Hello");
  });

  test("returns text unchanged if exactly maxLength", () => {
    expect(truncateText("1234567890", 10)).toBe("1234567890");
  });

  test("truncates and appends ellipsis when text exceeds maxLength", () => {
    const result = truncateText("This is a long string that needs truncation.", 20);
    expect(result).toBe("This is a long strin...");
    expect(result.length).toBeLessThanOrEqual(23);
  });

  test("handles empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });

  test("handles zero maxLength", () => {
    expect(truncateText("Hello", 0)).toBe("...");
  });
});

// =============================================================
// extractTextBetween — generic utility pattern found in many modules
// =============================================================
function extractTextBetween(text, startMarker, endMarker) {
  if (!text) return "";
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return "";
  const contentStart = startIdx + startMarker.length;
  const endIdx = text.indexOf(endMarker, contentStart);
  if (endIdx === -1) return text.substring(contentStart);
  return text.substring(contentStart, endIdx);
}

describe("extractTextBetween", () => {
  test("extracts text between markers", () => {
    expect(extractTextBetween("Hello [START] World [END] Bye", "[START]", "[END]")).toBe(" World ");
  });

  test("returns empty string when start marker not found", () => {
    expect(extractTextBetween("Hello World", "[START]", "[END]")).toBe("");
  });

  test("returns from start to end when end marker not found", () => {
    expect(extractTextBetween("Hello [START] World", "[START]", "[END]")).toBe(" World");
  });

  test("returns empty string for null input", () => {
    expect(extractTextBetween(null, "[", "]")).toBe("");
  });
});
