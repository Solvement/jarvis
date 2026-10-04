import { library } from "@/lib/store";
import { readingMarkdown } from "@/lib/reading-export";
import { getDb, json, viewerOf } from "@/lib/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("itemId");
  const version = params.get("version");
  const level = params.get("level");
  const lib = await library(await getDb(), await viewerOf(request));
  const r = lib.readings.find((r) => r.itemId === id && r.generatedAt === version && (!level || r.level === level));
  if (!r) return json({ error: "没有找到这个阅读版本" }, 404);
  const filename = r.itemId.replace(/[^a-z0-9.-]/gi, "-") + ".md";
  return new Response(readingMarkdown(r), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
