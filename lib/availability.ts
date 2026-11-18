import type {Member} from './types';

// Return date is the first available day, using the household's calendar dates.
export function memberAvailable(member:Member,date:string):boolean {
 return member.participates!==false && !(member.away_from && date>=member.away_from && (!member.away_until || date<member.away_until));
}

export function validCalendarDate(value:unknown):value is string {
 return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
