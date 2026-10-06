import { describe, it, expect } from "vitest";
import { parseBlocks } from "@/lib/body";

describe("章节正文分块", () => {
  it("空行分段落", () => {
    expect(parseBlocks("第一段。\n\n第二段。")).toEqual([
      { kind: "p", text: "第一段。" },
      { kind: "p", text: "第二段。" },
    ]);
  });

  it("连续的 - 行成为无序列表，前后的普通行仍是段落", () => {
    expect(parseBlocks("结论如下：\n- 甲\n- 乙\n说明在后。")).toEqual([
      { kind: "p", text: "结论如下：" },
      { kind: "ul", items: ["甲", "乙"] },
      { kind: "p", text: "说明在后。" },
    ]);
  });

  it("数字加点的行成为有序列表", () => {
    expect(parseBlocks("1. 先做\n2. 再做")).toEqual([{ kind: "ol", items: ["先做", "再做"] }]);
  });

  it("段内普通换行保留为同一段", () => {
    expect(parseBlocks("一行\n二行")).toEqual([{ kind: "p", text: "一行\n二行" }]);
  });

  it("列表项内的行首空格被去掉，空项被丢弃", () => {
    expect(parseBlocks("-   甲\n- \n- 乙")).toEqual([{ kind: "ul", items: ["甲", "乙"] }]);
  });
});
