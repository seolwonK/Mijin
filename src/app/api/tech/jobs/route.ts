import { NextRequest } from 'next/server';
import { portalJobsResponse } from '@/lib/portalJobs';
export async function GET(req: NextRequest) {
  return portalJobsResponse(req, 'TECHNICIAN');
}
