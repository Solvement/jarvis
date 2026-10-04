import { describe, it, expect } from "vitest";
import { bearerMatches, isOwnerEmail, isSameOrigin } from "@/lib/access";

describe("Bearer 凭证", () => {
  const req = (h?: string) => new Request("https://x.test/api", { headers: h ? { authorization: h } : {} });
  it("凭证一致才通过", () => {
    expect(bearerMatches(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(bearerMatches(req("Bearer wrong"), "s3cret")).toBe(false);
    expect(bearerMatches(req(), "s3cret")).toBe(false);
  });
  it("服务器未配置凭证时一律拒绝", () => {
    expect(bearerMatches(req("Bearer "), undefined)).toBe(false);
    expect(bearerMatches(req("Bearer "), "")).toBe(false);
  });
});

describe("作者身份", () => {
  it("邮箱大小写与空格不敏感", () => {
    expect(isOwnerEmail("Me@Example.com", " me@example.com , other@x.com")).toBe(true);
    expect(isOwnerEmail("stranger@x.com", "me@example.com")).toBe(false);
  });
  it("未配置作者时没有人是作者", () => {
    expect(isOwnerEmail("me@example.com", undefined)).toBe(false);
    expect(isOwnerEmail(undefined, "me@example.com")).toBe(false);
  });
});

describe("同源写请求", () => {
  it("跨站 Origin 被拒绝，缺省 Origin 放行", () => {
    const mk = (origin?: string) => new Request("https://jarvis.test/api/x", { method: "POST", headers: origin ? { origin } : {} });
    expect(isSameOrigin(mk("https://jarvis.test"))).toBe(true);
    expect(isSameOrigin(mk("https://evil.test"))).toBe(false);
    expect(isSameOrigin(mk())).toBe(true);
  });
});
