import type {Theme} from './ThemeContext';
interface Palette {
 bg:string; surface:string; raised:string; elevated:string;
 accent:string; hover:string; secondary:string; text:string; muted:string; quiet:string;
}
function mix(foreground:string,background:string,weight:number):string {
 return '#'+[1,3,5].map(i=>Math.round(parseInt(foreground.slice(i,i+2),16)*weight+parseInt(background.slice(i,i+2),16)*(1-weight)).toString(16).padStart(2,'0')).join('');
}
function holiday(id:string,name:string,description:string,icon:string,p:Palette):Theme {
 return {id,name,description,seasonal:true,seasonalIcon:icon,artwork:`/themes/${id}-cartoon.png`,category:'dark',previewBg:p.bg,previewAccent:p.accent,vars:{
  '--bg':p.bg,'--surface':p.surface,'--surface-2':p.raised,'--surface-3':p.elevated,
  '--accent':p.accent,'--accent-hover':p.hover,'--accent-2':p.secondary,'--accent-text':p.bg,
  '--t1':p.text,'--t2':p.muted,'--t3':p.quiet,
  '--green':'#76dfac','--amber':'#ffd27c','--red':'#ff9696',
  '--border':mix(p.accent,p.raised,.24),'--control-border':mix(p.accent,p.raised,.68),
 }};
}
export const HOLIDAY_THEMES:Theme[]=[
 holiday('halloween','Halloween','Pumpkin orange, warm charcoal & golden candlelight','\u{1f383}',{
  bg:'#15110f',surface:'#211a15',raised:'#30241b',elevated:'#3b2d22',accent:'#ffad4f',hover:'#ffc878',secondary:'#b9d77e',text:'#fff4e7',muted:'#ddc8b5',quiet:'#bda58e',
 }),
 holiday('new-year','New Year','Midnight navy, champagne gold & icy blue','\u2726',{
  bg:'#0d1422',surface:'#162036',raised:'#202d45',elevated:'#2a3851',accent:'#e7c46b',hover:'#f5d992',secondary:'#99c4ff',text:'#f4f7ff',muted:'#c4d0e5',quiet:'#a6b6d0',
 }),
 holiday('valentine','Valentine','Warm cherry, soft rose & vanilla highlights','\u2665',{
  bg:'#211217',surface:'#301b24',raised:'#402631',elevated:'#4a2d38',accent:'#ffa0b1',hover:'#ffbfcb',secondary:'#ffd292',text:'#fff2f4',muted:'#e5c5cc',quiet:'#cba6b0',
 }),
 holiday('lunar-new-year','Lunar New Year','Lacquer red, lantern gold & warm ivory','\u{1f3ee}',{
  bg:'#241110',surface:'#351916',raised:'#47251e',elevated:'#512c24',accent:'#f6ce76',hover:'#ffe1a0',secondary:'#ff9990',text:'#fff5e8',muted:'#e7cbbb',quiet:'#cfad99',
 }),
 holiday('st-patrick',"St. Patrick's Day",'Rich emerald, fresh shamrock green & gold','\u2618',{
  bg:'#0c1912',surface:'#13291d',raised:'#1d3626',elevated:'#274331',accent:'#a3e276',hover:'#c2f39d',secondary:'#f2d17c',text:'#f4fbea',muted:'#cedec2',quiet:'#b0c6a2',
 }),
 holiday('easter','Easter','Spring teal, butter-yellow & pastel peach','\u{1f95a}',{
  bg:'#10201f',surface:'#192e2b',raised:'#253d37',elevated:'#304840',accent:'#f2d798',hover:'#ffe8bb',secondary:'#a3ddd0',text:'#fff9ed',muted:'#dedbc5',quiet:'#bfc4ae',
 }),
 holiday('earth-day','Earth Day','Ocean teal, fresh mint & sky-blue accents','\u{1f33f}',{
  bg:'#0b1b20',surface:'#122b32',raised:'#1c3940',elevated:'#28474c',accent:'#8de1cd',hover:'#b4f1e2',secondary:'#99cef5',text:'#effbf8',muted:'#c4ddd9',quiet:'#aac3bf',
 }),
 holiday('christmas','Christmas','Deep evergreen, festive coral & candlelight gold','\u2744',{
  bg:'#101a16',surface:'#1b2b23',raised:'#293a30',elevated:'#34463a',accent:'#ffaaa0',hover:'#ffc8bd',secondary:'#eed08a',text:'#fff8ed',muted:'#e0d8c8',quiet:'#c1bfab',
 }),
];
