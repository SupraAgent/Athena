import { describe, it, expect } from "vitest";
import { extractBalancedJson } from "../json-extract";

describe("extractBalancedJson", () => {
  it("extracts simple JSON object", () => {
    const result = extractBalancedJson('{"key": "value"}');
    expect(result).toBe('{"key": "value"}');
    expect(JSON.parse(result!)).toEqual({ key: "value" });
  });

  it("extracts JSON from surrounding text", () => {
    const text = 'Here is the result: {"name": "test", "count": 42} and some more text.';
    const result = extractBalancedJson(text);
    expect(result).toBe('{"name": "test", "count": 42}');
  });

  it("handles nested braces", () => {
    const text = '{"outer": {"inner": {"deep": true}}}';
    const result = extractBalancedJson(text);
    expect(result).toBe(text);
    expect(JSON.parse(result!)).toEqual({ outer: { inner: { deep: true } } });
  });

  it("handles strings with braces inside", () => {
    const json = '{"text": "a {curly} brace"}';
    const result = extractBalancedJson(json);
    expect(result).toBe(json);
    expect(JSON.parse(result!)).toEqual({ text: "a {curly} brace" });
  });

  it("returns null for no JSON", () => {
    const result = extractBalancedJson("no json here at all");
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const result = extractBalancedJson("{not valid json}");
    expect(result).toBeNull();
  });

  it("ignores trailing text after JSON", () => {
    const text = '{"a": 1} this is ignored {"b": 2}';
    const result = extractBalancedJson(text);
    expect(result).toBe('{"a": 1}');
  });
});
