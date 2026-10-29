import { isSameOrigin } from '@/lib/access';
import { deleteCollection,getCollections,saveCollection } from '@/lib/personal';
import { getDb,json,viewerOf } from '@/lib/server';
export async function GET(request:Request) {
  const viewer=await viewerOf(request);
  if (!viewer.userId) return json({error:'请先登录'},401);
  return json({collections:await getCollections(await getDb(),viewer.userId)});
}
export async function PUT(request:Request) {
  if (!isSameOrigin(request)) return json({error:'请从本站操作'},403);
  const viewer=await viewerOf(request);
  if (!viewer.userId) return json({error:'请先登录'},401);
  const body=await request.json().catch(()=>null);
  if (!body || typeof body.title!=='string' || !Array.isArray(body.items) || body.id!==undefined && typeof body.id!=='string') return json({error:'合集字段无效'},400);
  try { return json({collections:await saveCollection(await getDb(),viewer.userId,body)}); }
  catch(e) { return json({error:e instanceof Error ? e.message:'保存失败'},400); }
}
export async function DELETE(request:Request) {
  if (!isSameOrigin(request)) return json({error:'请从本站操作'},403);
  const viewer=await viewerOf(request);
  if (!viewer.userId) return json({error:'请先登录'},401);
  const id=new URL(request.url).searchParams.get('id');
  if (!id) return json({error:'需要合集编号'},400);
  return json({collections:await deleteCollection(await getDb(),viewer.userId,id)});
}
