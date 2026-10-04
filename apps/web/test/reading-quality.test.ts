import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { validateDeep } from "@/lib/reading-quality";
import type { Reading } from "@/lib/types";

const fx = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/readings.json.gz", import.meta.url))).toString("utf8")) as {
  deep: Reading;
  skillGuideCards: number;
  legacyDeep: Reading;
};

describe("精读准入（结构校验，不代表质量）", () => {
  it("已发布的源码精读通过", () => {
    expect(() => validateDeep(fx.deep)).not.toThrow();
    expect(fx.skillGuideCards).toBe(37);
  });

  const mutations: [string, (r: Reading) => void][] = [
    ["缺 study", (r) => delete r.study],
    ["只读 README", (r) => (r.coverage = "readme")],
    ["快照非 HTTPS", (r) => (r.study!.sourceSnapshot = "http://example.com")],
    ["无阅读覆盖", (r) => (r.study!.sourceCoverage = [])],
    ["论断引用不存在的来源", (r) => (r.study!.claims[0].evidence[0].source = "missing")],
    ["机制关联不存在的论断", (r) => (r.study!.mechanisms[0].claims = ["missing"])],
    ["无关联分析", (r) => (r.study!.connections = [])],
    ["无复核方法", (r) => (r.study!.review.method = "")],
    ["状态非法", (r) => ((r.study as { status: string }).status = "made_up")],
  ];
  it.each(mutations)("拒绝：%s", (_, mutate) => {
    const r = structuredClone(fx.deep);
    mutate(r);
    expect(() => validateDeep(r)).toThrow();
  });

  it("未补齐研读记录的历史精读不能重新导入", () => {
    expect(() => validateDeep(fx.legacyDeep)).toThrow();
  });
});
