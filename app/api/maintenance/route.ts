import {failure,ok,requireWorker} from '@/lib/server';
import {runMaintenance} from '@/lib/worker';
export const maxDuration=60;
export async function POST(request:Request){try{requireWorker(request);return ok({deleted:await runMaintenance()});}catch(e){return failure(e);}}
