import { test, expect } from "bun:test";
import { parseCookieInput } from "./paste";

test("parses a full Cookie request header", () => {
  const raw = "Cookie: csrftoken=abc123; LEETCODE_SESSION=eyJ.session.tok; sessionid=x";
  expect(parseCookieInput(raw)).toEqual({ csrftoken: "abc123", lc_session: "eyJ.session.tok" });
});

test("parses document.cookie style (no header label)", () => {
  expect(parseCookieInput("csrftoken=abc; LEETCODE_SESSION=xyz")).toEqual({
    csrftoken: "abc",
    lc_session: "xyz",
  });
});

test("parses newline-separated KEY=VALUE", () => {
  expect(parseCookieInput("csrftoken=abc\nLEETCODE_SESSION=xyz\n")).toEqual({
    csrftoken: "abc",
    lc_session: "xyz",
  });
});

test("keeps '=' padding inside values", () => {
  const r = parseCookieInput("LEETCODE_SESSION=ab.cd.ef==; csrftoken=tok");
  expect(r.lc_session).toBe("ab.cd.ef==");
  expect(r.csrftoken).toBe("tok");
});

test("strips surrounding quotes", () => {
  expect(parseCookieInput('csrftoken="abc"; LEETCODE_SESSION="xyz"')).toEqual({
    csrftoken: "abc",
    lc_session: "xyz",
  });
});

test("returns empty for junk / no cookies", () => {
  expect(parseCookieInput("hello world")).toEqual({});
  expect(parseCookieInput("")).toEqual({});
});

test("ignores unrelated cookies and partial input", () => {
  expect(parseCookieInput("foo=bar; csrftoken=only")).toEqual({ csrftoken: "only" });
});
