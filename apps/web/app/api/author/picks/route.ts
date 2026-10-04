import { savePicks } from "@/lib/picks";
import { bearerMatches } from "@/lib/access";
import { errorMessage, getDb, json } from "@/lib/server";

/** 整期写入看点卡：POST ?edition=YYYY-MM-DD，body 为 PickInput 数组。 */
export async function POST(request: Request) {
  if (!bearerMatches(request, process.env.AUTHOR_TOKEN)) return json({ error: "作者凭证无效" }, 401);
  const edition = new URL(request.url).searchParams.get("edition") ?? "";
  try {
    return json(await savePicks(await getDb(), edition, JSON.parse(await request.text())));
  } catch (e) {
    return json({ error: errorMessage(e, "看点卡无效") }, 400);
  }
}
