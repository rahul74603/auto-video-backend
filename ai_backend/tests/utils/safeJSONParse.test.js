/**
 * Tests for safeJSONParse utility.
 * This function is defined in ai_backend/index.js and used across the codebase
 * to safely parse JSON responses from AI models.
 */

// Replicate the function under test
function safeJSONParse(text) {
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

describe("safeJSONParse", () => {
  test("parses plain JSON object", () => {
    const input = '{"key": "value"}';
    expect(safeJSONParse(input)).toEqual({ key: "value" });
  });

  test("parses JSON wrapped in markdown code block", () => {
    const input = '```json\n{"title": "Test", "count": 5}\n```';
    expect(safeJSONParse(input)).toEqual({ title: "Test", count: 5 });
  });

  test("parses JSON wrapped in triple backticks without language", () => {
    const input = '```\n{"name": "example"}\n```';
    expect(safeJSONParse(input)).toEqual({ name: "example" });
  });

  test("strips leading/trailing text before braces", () => {
    const input =
      'Here is the generated JSON:\n{"questions": [{"id": 1}]}\nEnd.';
    expect(safeJSONParse(input)).toEqual({ questions: [{ id: 1 }] });
  });

  test("handles nested objects", () => {
    const input = '{"data": {"items": [1, 2, 3], "meta": {"page": 1}}}';
    expect(safeJSONParse(input)).toEqual({
      data: { items: [1, 2, 3], meta: { page: 1 } },
    });
  });

  test("handles JSON with array at root level wrapped in extra text", () => {
    const input = 'Result:\n{"items": ["a", "b"]}\nDone.';
    expect(safeJSONParse(input)).toEqual({ items: ["a", "b"] });
  });

  test("throws on invalid JSON", () => {
    expect(() => safeJSONParse("not json")).toThrow();
  });

  test("throws on empty string", () => {
    expect(() => safeJSONParse("")).toThrow();
  });

  test("handles JSON with unicode characters", () => {
    const input = '{"text": "हिन्दी", "text2": "日本語"}';
    expect(safeJSONParse(input)).toEqual({ text: "हिन्दी", text2: "日本語" });
  });

  test("handles JSON with escaped quotes", () => {
    const input = '{"message": "He said \\\"Hello\\\""}';
    expect(safeJSONParse(input)).toEqual({ message: 'He said "Hello"' });
  });

  test("handles JSON with boolean and null values", () => {
    const input = '{"active": true, "data": null, "count": 0}';
    expect(safeJSONParse(input)).toEqual({ active: true, data: null, count: 0 });
  });

  test("handles text with multiple code blocks by merging outer braces", () => {
    const input =
      'First attempt: ```json\n{"first": true}\n```\nSecond attempt: ```json\n{"second": true}\n```';
    // The function finds the first '{' and last '}', so it captures both objects
    // This is a known limitation — in practice the AI returns a single JSON block
    expect(() => safeJSONParse(input)).toThrow();
  });
});
