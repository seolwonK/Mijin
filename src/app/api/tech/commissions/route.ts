import { NextRequest } from 'next/server';
import { portalCommissionsResponse } from '@/lib/portalCommissions';
export async function GET(req: NextRequest) {
  return portalCommissionsResponse(req, 'TECHNICIAN');
}
