import { Login } from '@/components/login';
export default function Page(){return <Login invited configured={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}/>;}
