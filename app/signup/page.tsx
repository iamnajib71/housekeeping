import { Login } from '@/components/login';
export default function Page(){return <Login signup configured={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}/>;}
