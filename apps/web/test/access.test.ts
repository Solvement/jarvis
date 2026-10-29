import { describe, it, expect } from "vitest";
import { bearerMatches, isOwnerEmail, isSameOrigin, isLocalPersonalRequest } from "@/lib/access";

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

describe('本机私人模式边界',()=>{
  const env={NODE_ENV:'development',PERSONAL_LOCAL_MODE:'1'} as NodeJS.ProcessEnv;
  const req=(url='http://localhost:3100/api/me/state',headers:Record<string,string>={})=>new Request(url,{headers});
  it('需要开发环境、显式开关和回环地址，生产/远端库永不启用',()=>{
    expect(isLocalPersonalRequest(req(),env)).toBe(true);
    expect(isLocalPersonalRequest(req(),{...env,NODE_ENV:'production'})).toBe(false);
    expect(isLocalPersonalRequest(req(),{...env,DATABASE_URL:'postgres://remote'})).toBe(false);
    expect(isLocalPersonalRequest(req(),{...env,PERSONAL_LOCAL_MODE:'0'})).toBe(false);
    expect(isLocalPersonalRequest(req('http://192.168.1.2:3100/api'),env)).toBe(false);
  });
  it('兼容 Next 本地 Request hostname；拒绝伪造 Host/跨站 Origin',()=>{
    const headers={host:'127.0.0.1:3100','x-forwarded-host':'127.0.0.1:3100',origin:'http://127.0.0.1:3100'};
    expect(isSameOrigin(req(undefined,headers))).toBe(true);
    expect(isLocalPersonalRequest(req(undefined,headers),env)).toBe(true);
    expect(isLocalPersonalRequest(req(undefined,{...headers,host:'evil.test'}),env)).toBe(false);
    expect(isLocalPersonalRequest(req(undefined,{...headers,'x-forwarded-host':'evil.test'}),env)).toBe(false);
    expect(isLocalPersonalRequest(req(undefined,{...headers,origin:'http://evil.test'}),env)).toBe(false);
    expect(isLocalPersonalRequest(req(undefined,{...headers,'sec-fetch-site':'cross-site'}),env)).toBe(false);
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
