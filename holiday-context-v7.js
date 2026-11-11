/* Serenity holiday context, U.S. federal holidays (including observed days).
   Informational: holiday dates never apply an unverified traffic discount. */
(()=>{
'use strict';
const iso=(year,month,day)=>year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
const weekday=(year,month,day)=>new Date(year,month-1,day,12).getDay();
const nth=(year,month,dow,num)=>{
 let day=1+((7+dow-weekday(year,month,1))%7)+(num-1)*7;
 return iso(year,month,day);
};
const last=(year,month,dow)=>{
 const day=new Date(year,month,0,12).getDate();
 return iso(year,month,day-((7+weekday(year,month,day)-dow)%7));
};
const observed=(year,month,day)=>{
 const d=new Date(year,month-1,day,12),wd=d.getDay();
 if(wd===6)d.setDate(d.getDate()-1);
 else if(wd===0)d.setDate(d.getDate()+1);
 return iso(d.getFullYear(),d.getMonth()+1,d.getDate());
};
const fixed=[
 ['New Year’s Day',1,1],['Juneteenth',6,19],['Independence Day',7,4],
 ['Veterans Day',11,11],['Christmas Day',12,25]
];
function list(year){
 if(!Number.isSafeInteger(year)||year<2000||year>2100)return [];
 const result=[
  ['Martin Luther King Jr. Day',nth(year,1,1,3)],
  ['Washington’s Birthday',nth(year,2,1,3)],
  ['Memorial Day',last(year,5,1)],
  ['Labor Day',nth(year,9,1,1)],
  ['Columbus Day / Indigenous Peoples’ Day (federal observance)',nth(year,10,1,2)],
  ['Thanksgiving Day',nth(year,11,4,4)]
 ];
 for(const [name,m,d] of fixed){
   result.push([name,iso(year,m,d)]);
   const off=observed(year,m,d);
   if(off!==iso(year,m,d))result.push([name+' (observed)',off]);
 }
 // New Year's observed date may fall on Dec 31 of the previous year.
 for(const yr of [year+1,year-1]){
  const x=observed(yr,1,1);
  if(x.slice(0,4)===String(year)&&x!==iso(yr,1,1))
   result.push(['New Year’s Day (observed)',x]);
 }
 return result.map(([name,date])=>({name,date,scope:'U.S. federal calendar'}));
}
function get(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return null;
 const holiday=list(Number(date.slice(0,4))).find(h=>h.date===date);
 return holiday||null;
}
window.SerenityHolidays={get,list};
})();
