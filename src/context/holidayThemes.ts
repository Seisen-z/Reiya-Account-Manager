import type {Theme} from './ThemeContext';
function holiday(id:string,name:string,description:string,icon:string,bg:string,surface:string,surface2:string,accent:string,text:string):Theme {
 return {id,name,description,seasonal:true,seasonalIcon:icon,artwork:`/themes/${id}-cartoon.png`,category:'dark',previewBg:bg,previewAccent:accent,vars:{
 '--bg':bg,'--surface':surface,'--surface-2':surface2,'--surface-3':surface2,'--accent':accent,'--accent-text':bg,
 '--t1':text,'--t2':'#c5ced0','--t3':'#a1b0b4','--green':'#4ade80','--amber':'#fbbf24','--red':'#fb7185','--border':accent+'44'
 }};
}
export const HOLIDAY_THEMES:Theme[]=[
 holiday('new-year','New Year','Midnight blue, golden stars & a fresh start','✦',' #101c2c'.trim(),'#182a40','#223750','#f6cf72','#fff8e6'),
 holiday('valentine','Valentine','Cherry red, blush hearts & warm details','♥','#251218','#381e27','#4b2934','#ff96aa','#fff0f4'),
 holiday('lunar-new-year','Lunar New Year','Red lanterns & golden celebration','🏮','#29120e','#3b1c15','#50291e','#ffd277','#fff2de'),
 holiday('easter','Easter','Spring mint, pastel eggs & fresh beginnings','🥚','#122521','#1c3730','#284b41','#a9e6b7','#f1fff3'),
 holiday('earth-day','Earth Day','Forest green, blue accents & leafy details','🌿','#0d2424','#153735','#204a45','#79dec0','#ebfff8'),
 holiday('christmas','Christmas','Evergreen, festive red & snowy details','❄','#11241c','#1b3528','#294637','#ffc5ba','#f5fff6'),
];
