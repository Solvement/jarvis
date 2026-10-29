import { entryContent } from '@/lib/catalog';
import { getDb,json,viewerOf } from '@/lib/server';
export async function GET(request:Request) {
  const id=new URL(request.url).searchParams.get('id');
  if (!id || id.length>300) return json({error:'需要有效条目'},400);
  const result=await entryContent(await getDb(),await viewerOf(request),id);
  return result.entry ? json(result) : json({error:'条目不存在或尚未公开'},404);
}
