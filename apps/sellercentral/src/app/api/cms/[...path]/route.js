import { cmsProxy } from '@trulo/lib/cms-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = 'fra1';
const handler = cmsProxy(["admin-hub","admin","uploads"]);
export { handler as GET, handler as HEAD, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
