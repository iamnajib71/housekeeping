// Keep each browser tab bound to its own property, even when another tab switches homes.
export function propertyHeaders():Record<string,string>{
 if(typeof window==='undefined')return {};
 const home=new URLSearchParams(window.location.search).get('home');
 return home&&/^\d+$/.test(home)?{'x-household-id':home}:{};
}
