export type SignupMode = 'admin' | 'admin_tenant';
export function signupMode(value: unknown): SignupMode {
  if (value !== 'admin' && value !== 'admin_tenant') throw new Error('Choose how you will use this home.');
  return value;
}
export function accountName(value: unknown, max = 40): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`Enter a name of up to ${max} characters.`);
  return value.trim();
}
export function inviteEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter the tenant’s email.');
  const email=value.trim().toLowerCase();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}
export function validInviteToken(value: unknown): value is string {
  return typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
}
