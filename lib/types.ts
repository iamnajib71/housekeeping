export type Kind = 'daily' | 'weekly';
export type Status = 'draft' | 'submitted' | 'approved' | 'rework';
export type Member = { id: string; name: string; email?: string | null; role: 'admin' | 'member'; position: number; color: string };
export type Assignment = { id: string; date: string; kind: Kind; member_ids: string[]; tasks: string[] };
export type Submission = { id: string; assignment_id: string; member_id: string; tasks: string[]; notes: string; status: Status; submitted_at: string | null; review_note: string; photo_count?: number };
export type Photo = { id: string; submission_id: string; path: string; created_at: string; expires_at: string; deleted_at: string | null; uploaded: boolean; url?: string };
export type Settings = { id: number; timezone: string; daily_start: string; weekly_start: string; daily_tasks: string[]; weekly_tasks: string[]; evening_hour: number; morning_hour: number; deadline_hour: number; reminders_enabled: boolean };
export type DashboardData = { me: Member; members: Member[]; assignments: Assignment[]; submissions: Submission[]; settings: Settings; today: string; health?: { last_run: string | null; last_error: string | null; sent: number; pending: number } };
