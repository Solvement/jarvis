import { getAuth } from "@/lib/auth";

const handle = async (request: Request) => (await getAuth()).handler(request);
export { handle as GET, handle as POST };
