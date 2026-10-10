import { LUNAR_NEW_YEAR_DATES } from "./lunarNewYearDates";
// Annual local-calendar scheduling. End dates are exclusive; manual selections always win.
export const THEME_PREFERENCE_KEY = "reiya_theme_preference_v1";
export interface ThemePreference { mode: "automatic" | "manual"; themeId?: string; previousId?: string; }
export interface HolidayEvent { themeId: string; name: string; start: Date; end: Date; }
export const SEASONAL_IDS = ["halloween", "new-year", "valentine", "christmas", "lunar-new-year", "easter", "earth-day", "st-patrick"];
const calendarCache = new Map<number, HolidayEvent[]>();
const localDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);
const nextDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
// Gregorian ecclesiastical Easter (not Orthodox Easter).
export function easterDate(year: number): Date {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const n=h+l-7*m+114;
  return localDate(year,Math.floor(n/31),n%31+1);
}
// Authoritative offline table avoids ICU/WebView calendar discrepancies.
export function lunarNewYearDate(year: number): Date | null {
  const value=LUNAR_NEW_YEAR_DATES[year];
  return value ? localDate(year,value[0],value[1]) : null;
}
export function getHolidayEvents(year: number): HolidayEvent[] {
  if(!Number.isInteger(year)||year<1583||year>9998)return [];
  const cached=calendarCache.get(year);if(cached)return cached.map(e=>({...e,start:new Date(e.start),end:new Date(e.end)}));
  const events: HolidayEvent[]=[];
  const add=(themeId:string,name:string,start:Date,end=nextDay(start))=>events.push({themeId,name,start,end});
  add("new-year","New Year's Day",localDate(year,1,1));
  const lunar=lunarNewYearDate(year);if(lunar)add("lunar-new-year","Lunar New Year",lunar);
  add("valentine","Valentine's Day",localDate(year,2,14));
  add("st-patrick","St. Patrick's Day",localDate(year,3,17));
  add("easter","Easter Sunday",easterDate(year));
  add("earth-day","Earth Day",localDate(year,4,22));
  add("halloween","Halloween season",localDate(year,10,9),localDate(year,12,1));
  add("christmas","Christmas Eve & Day",localDate(year,12,24),localDate(year,12,26));
  add("new-year","New Year's Eve",localDate(year,12,31));
  events.sort((a,b)=>a.start.getTime()-b.start.getTime());
  if(calendarCache.size>4)calendarCache.clear();calendarCache.set(year,events);
  return events.map(e=>({...e,start:new Date(e.start),end:new Date(e.end)}));
}
export function getActiveHoliday(now=new Date()): HolidayEvent | null {
  if(!Number.isFinite(now.getTime()))return null;
  // In a shared-date overlap, Lunar New Year takes priority over Valentine; Easter over Earth Day.
  const priority=["lunar-new-year","easter","valentine","st-patrick","earth-day","new-year","christmas","halloween"];
  return getHolidayEvents(now.getFullYear()).filter(e=>now>=e.start&&now<e.end)
    .sort((a,b)=>priority.indexOf(a.themeId)-priority.indexOf(b.themeId))[0]||null;
}
export function isHalloweenSeason(now=new Date()): boolean {return getActiveHoliday(now)?.themeId==="halloween";}
export function resolveThemeId(savedId:string|undefined,preference:ThemePreference|null,now=new Date()):string {
  if(preference?.mode==="manual")return preference.themeId||savedId||"reiya-dark";
  const holiday=getActiveHoliday(now);if(holiday)return holiday.themeId;
  // A persisted seasonal selection is not a normal-theme fallback after the season ends.
  return [preference?.previousId,savedId].find(id=>id&&!SEASONAL_IDS.includes(id))||"reiya-dark";
}
export function readThemePreference():ThemePreference|null {
  try {const p=JSON.parse(localStorage.getItem(THEME_PREFERENCE_KEY)||"null");if(p?.mode==="automatic"||(p?.mode==="manual"&&typeof p.themeId==="string"))return p;}catch{/* Startup remains usable if storage is corrupt or blocked. */}return null;
}
export function writeThemePreference(p:ThemePreference) {try{localStorage.setItem(THEME_PREFERENCE_KEY,JSON.stringify(p));}catch{/* Selection still works in memory. */}}
