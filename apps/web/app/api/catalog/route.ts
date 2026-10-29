import { catalogContent } from '@/lib/catalog';
import { isAuthConfigured,authMethods } from '@/lib/auth';
import { getDb,json,viewerOf } from '@/lib/server';
import { latestEdition } from '@/lib/picks';
import { ensureGithubToday,ensureDiscoveryToday } from '@/lib/store';
import { fetchBoard,sourceDay } from '@/lib/sources';

export async function GET(request:Request) {
  try {
    const viewer=await viewerOf(request);
    const db=await getDb();
    const projectDay=sourceDay();
    const params=new URL(request.url).searchParams;
    const projectStatus=params.get('today')==='1'?await ensureDiscoveryToday(db,fetchBoard,projectDay):params.get('github')==='today'?await ensureGithubToday(db,fetchBoard,projectDay):{day:projectDay,notice:''};
    const [{ entries,boards },edition]=await Promise.all([catalogContent(db,viewer),latestEdition(db)]);
    const latest = [...new Map(boards.map(b=>[b.id,b] as const).reverse()).values()];
    const projectArchives=[...new Map(boards.filter(b=>b.source==='github'&&b.sourceDate!==projectDay).map(b=>[`${b.id}:${b.sourceDate}`,b] as const).reverse()).values()];
    return json({ entries, boards:latest, projectArchives,projectDay,notice:projectStatus.notice, featured:edition?.picks.map(p=>p.itemId)||[], editions:[...new Set(boards.map(b=>b.sourceDate))].sort().reverse(),
      viewer:{signedIn:!!viewer.userId,isOwner:viewer.isOwner,authEnabled:isAuthConfigured(),local:!!viewer.local,...authMethods()} });
  } catch { return json({error:'资料库暂不可用，请重试。'},503); }
}
