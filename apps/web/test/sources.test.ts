import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseGithub, parseHF, isoWeek, sourceUrl } from "@/lib/sources";
import type { Period } from "@/lib/types";

// 2026-10-02 实取的六榜页面（gzip）。数量是当天人工核对过的线上条数。
const fixture = (name: string) => gunzipSync(readFileSync(new URL(`./fixtures/${name}.gz`, import.meta.url))).toString("utf8");

describe("GitHub Trending 解析", () => {
  it.each([
    ["daily", 17],
    ["weekly", 17],
    ["monthly", 23],
  ] as [Period, number][])("%s 榜完整、有序、字段齐全", async (period, count) => {
    const items = await parseGithub(fixture(`github-${period}.html`));
    expect(items).toHaveLength(count);
    expect(items.map((e) => e.rank)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    const first = items[0];
    expect(first.stars! > 0 && first.forks! > 0 && first.growth! > 0).toBe(true);
    expect(first.contributors!.length).toBeGreaterThan(0);
    expect(first.contributors!.every((c) => c.url === "https://github.com/" + c.name)).toBe(true);
  });

  it("结构变化时拒绝保存", async () => {
    await expect(parseGithub("<article>Broken</article>")).rejects.toThrow(/结构变化/);
  });
});

describe("HF Papers 解析", () => {
  it.each([
    ["daily", 77],
    ["weekly", 105],
    ["monthly", 105],
  ] as [Period, number][])("%s 榜与原始 props 顺序一致", async (period, count) => {
    const result = await parseHF(fixture(`hf-${period}.html`), period);
    const props = JSON.parse(fixture(`hf-${period}.json`));
    expect(result.items).toHaveLength(count);
    expect(result.items.map((e) => e.id)).toEqual(props.dailyPapers.map((e: { paper: { id: string } }) => "paper:" + e.paper.id));
  });

  it("周期不符时拒绝保存", async () => {
    const wrongPeriod = '<div data-props="{&quot;periodType&quot;:&quot;week&quot;,&quot;dailyPapers&quot;:[]}"></div>';
    await expect(parseHF(wrongPeriod, "daily")).rejects.toThrow(/不同周期/);
  });
});

describe("来源地址", () => {
  it("ISO 周跨年", () => {
    expect(isoWeek("2026-10-02")).toBe("2026-W40");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
  it("HF 月榜地址", () => {
    expect(sourceUrl("hf", "monthly", "2026-10-02")).toBe("https://huggingface.co/papers/month/2026-10");
  });
});
