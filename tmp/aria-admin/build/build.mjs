import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out='../../../output/aria-admin';await fs.mkdir(out,{recursive:true});
const w=Workbook.create();const s=w.worksheets.add('Budget');const a=w.worksheets.add('Assumptions');
for(const sh of [s,a]){sh.showGridLines=false;sh.getRange('A1:L55').format.font={name:'Arial',size:11};}
a.getRange('A2:F2').values=[['Arkhe cost assumptions',null,null,null,null,null]];
a.getRange('A4:D4').values=[['Input','Value','Unit','Basis / confirmation']];
a.getRange('A5:D14').values=[
['Duration',6,'months','Proposed six-month plan'],
['Rafael FTE',1,'FTE','Full time confirmed by applicant'],
['Rafael annual base',48000,'GBP / FTE year','Estimate. NCS user researcher range GBP34k-68k. Not current pay.'],
['Jameson FTE',0.5,'FTE','Part time confirmed; 50% is an estimate to confirm'],
['Jameson annual base',42000,'GBP / FTE year','Estimate. NCS research scientist range GBP27k-48k.'],
['Employer on-cost rate',0,'fraction','Excluded pending legal engagement and local payroll advice; zero is not an exemption.'],
['Labour overhead rate',0.25,'fraction','ARIA flat-rate option, subject to engagement classification'],
['External overhead rate',0.05,'fraction','ARIA flat-rate option'],
['Profit margin',0,'fraction','Cost-only planning; contract margin not assumed'],
['Output VAT / local tax',0,'fraction','Planning exclusion only. Legal/tax treatment unconfirmed']];
a.getRange('A17:D17').values=[['External work','Units','GBP / unit','Basis']];
a.getRange('A18:D24').values=[
['Rust/security implementation',120,500,'Estimate: 20 days/month for 6 months. Supplier not appointed.'],
['Evaluation / integration',40,450,'Estimate: 10 days/month in months 3-6. Supplier not appointed.'],
['Independent security review',15,800,'Estimate: 15 specialist days in month 5; obtain quotations.'],
['Compute',6,800,'Estimate monthly cap; actual metered invoices required.'],
['UK programme travel',2,3000,'Estimate two trips, one traveller each. Itinerary/quotes pending.'],
['Independent accountant report',1,2500,'Provisional grant audit allowance; confirm agreement and quote.'],
['Project IP/licence advice',1,2000,'Project-specific rights review only. No incorporation/marketing.']];
a.getRange('A27:D34').values=[
['Item','Status','Required action',''],
['Applicant','Arkhe','Legal entity, registration, signatory and country not established.',''],
['Start date','Not agreed','Official template date left blank; use relative M1-M6.',''],
['Employment status','Not established','Rafael/Jameson labour treatment conditional on legal relationship.',''],
['Rates','Planning estimates','UK role benchmarks are comparators, not proof of Brazilian pay or approved fees.',''],
['Quotes','Not obtained','Replace all external fee allowances with scope and supplier quotes.',''],
['UK benefit','Not secured','No UK location, partner or majority expenditure is asserted.',''],
['Funding fit','Review required','Bottom-up six-month estimate is below the indicative GBP200k Track 2 size.','']];
a.getRange('A37:B42').values=[
['Sources consulted 22 October 2026','URL'],
['User researcher salary comparator','https://nationalcareers.service.gov.uk/job-profiles/user-researcher'],
['Research scientist salary comparator','https://nationalcareers.service.gov.uk/job-profiles/research-scientist'],
['Software developer comparator, not contractor quote','https://nationalcareers.service.gov.uk/job-profiles/software-developer'],
['ARIA eligible costs','https://www.aria.org.uk/wp-content/uploads/2023/12/Eligible-Expenditure.pdf'],
['ARIA cost template','https://aria.org.uk/media/lhcpjxhc/aria-cost-template.xlsx']];
s.getRange('A2:I2').values=[['Arkhe six-month budget estimate',null,null,null,null,null,null,null,null]];
s.getRange('A4:B5').values=[['Estimated request (GBP)',null],['Direct costs (GBP)',null]];
s.getRange('B4').formulas=[['=I26']];s.getRange('B5').formulas=[['=SUM(I10,I19)']];
s.getRange('A7:I7').values=[['Category / role','FTE','M1','M2','M3','M4','M5','M6','Total GBP']];
const labels={8:'Rafael Oliveira',9:'Jameson Bednarski',10:'Employee costs',12:'Rust / security engineer (TBD)',13:'Evaluation / integration (TBD)',14:'Independent review (TBD)',15:'Compute',16:'Programme travel',17:'Accountant report',18:'IP / licence advice',19:'External costs',21:'Labour overhead',22:'External overhead',23:'Total eligible cost estimate',24:'Profit',25:'Output tax allowance',26:'Estimated request'};
for(const [r,t] of Object.entries(labels))s.getRange(`A${r}`).values=[[t]];
s.getRange('B8').formulas=[["='Assumptions'!B6"]];s.getRange('B9').formulas=[["='Assumptions'!B8"]];
for(let i=0;i<6;i++){
 const c=String.fromCharCode(67+i);
 s.getRange(`${c}8`).formulas=[["='Assumptions'!$B$7/12*$B8*(1+'Assumptions'!$B$10)"]];
 s.getRange(`${c}9`).formulas=[["='Assumptions'!$B$9/12*$B9*(1+'Assumptions'!$B$10)"]];
 s.getRange(`${c}10`).formulas=[[`=SUM(${c}8:${c}9)`]];
 s.getRange(`${c}12`).formulas=[["='Assumptions'!$B$18*'Assumptions'!$C$18/'Assumptions'!$B$5"]];
 s.getRange(`${c}13`).formulas=[[i>=2?"='Assumptions'!$B$19*'Assumptions'!$C$19/4":'=0']];
 s.getRange(`${c}14`).formulas=[[i===4?"='Assumptions'!$B$20*'Assumptions'!$C$20":'=0']];
 s.getRange(`${c}15`).formulas=[["='Assumptions'!$C$21"]];
 s.getRange(`${c}16`).formulas=[[(i===0||i===3)?"='Assumptions'!$C$22":'=0']];
 s.getRange(`${c}17`).formulas=[[i===5?"='Assumptions'!$B$23*'Assumptions'!$C$23":'=0']];
 s.getRange(`${c}18`).formulas=[[i===0?"='Assumptions'!$B$24*'Assumptions'!$C$24":'=0']];
 for(const [r,f] of [[19,`SUM(${c}12:${c}18)`],[21,`${c}10*'Assumptions'!$B$11`],[22,`${c}19*'Assumptions'!$B$12`],[23,`SUM(${c}10,${c}19,${c}21:${c}22)`],[24,`${c}23*'Assumptions'!$B$13`],[25,`SUM(${c}23:${c}24)*'Assumptions'!$B$14`],[26,`SUM(${c}23:${c}25)`]])s.getRange(`${c}${r}`).formulas=[['='+f]];
}
for(const r of Object.keys(labels))s.getRange(`I${r}`).formulas=[[`=SUM(C${r}:H${r})`]];
s.getRange('A29:B33').values=[['Planning qualifications',''],['Jameson part time','50% assumption; confirm hours and role'],['Tax and on-costs','Excluded pending review; estimate can increase'],['Six-month scope','Below indicative Track 2 project size; do not add unjustified costs'],['Official template','Prefilled separately; needs start date and Excel recalculation']];
s.getRange('A36:B36').values=[['Monthly cash need','Claims paid in arrears. No advance payment assumed.']];
for(const sh of [s,a]){
 sh.getRange('A2:I2').format.font={bold:true,size:15};sh.getRange('A:A').format.columnWidth=34;
 sh.getRange('B:B').format.columnWidth=18;sh.getRange('C:H').format.columnWidth=14;
}
s.getRange('I:I').format.columnWidth=19;s.getRange('A7:I26').format.rowHeight=25;
s.getRange('C8:I26').setNumberFormat('#,##0.00;(#,##0.00);"-"');s.getRange('B4:B5').setNumberFormat('"GBP "#,##0.00');
s.getRange('B8:B9').setNumberFormat('0%');s.getRange('B29:B36').format.columnWidth=35;
for(const r of [7,10,19,23,26])s.getRange(`A${r}:I${r}`).format={fill:r===7?'#20364D':'#E8EEF2',font:{bold:true,color:r===7?'#FFFFFF':'#000000'}};
a.getRange('D:D').format.columnWidth=85;a.getRange('C:C').format.columnWidth=20;
a.getRange('B5:B14').format.fill='#FFF2CC';a.getRange('B18:C24').format.fill='#FFF2CC';
a.getRange('B5:B14').format.font.color='#0000FF';a.getRange('B18:C24').format.font.color='#0000FF';
for(const r of [4,17,27,37])a.getRange(`A${r}:D${r}`).format={fill:'#20364D',font:{bold:true,color:'#FFFFFF'}};
a.getRange('B6').setNumberFormat('0%');a.getRange('B8').setNumberFormat('0%');a.getRange('B10:B14').setNumberFormat('0%');
s.getRange('B4:B5').format.font.bold=true;s.freezePanes.freezeRows(7);
w.recalculate();
const total=s.getRange('I26').values[0][0];console.log('TOTAL',total);if(Math.abs(total-153690)>0.01)throw new Error('Independent total mismatch');
// Verify an editable driver, restore, recalculate.
a.getRange('B8').values=[[0.4]];w.recalculate();if(Math.abs(s.getRange('I26').values[0][0]-151065)>0.01)throw new Error('FTE sensitivity mismatch');
a.getRange('B8').values=[[0.5]];w.recalculate();
for(const [sh,range,file] of [['Budget','A2:I26','budget-preview.png'],['Assumptions','A2:D24','assumptions-preview.png']]){
 const b=await w.render({sheetName:sh,range,scale:1.3,format:'png'});await fs.writeFile('../'+file,new Uint8Array(await b.arrayBuffer()));
}
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
await(await SpreadsheetFile.exportXlsx(w)).save(out+'/Arkhe-Budget-Assumptions.xlsx');
const map={'1. Basic Info':{'C9':'Arkhe - legal identity to confirm','C10':'Arkhe: verifiable policy-bound coordination (DRAFT ESTIMATE)','C11':'Brazil','C17':null,'C18':6,'C22':'monthly','C24':0,'C25':0,'C41':'Specification and baseline','C42':'Component interface and adapter','C43':'Persistence and recovery','C44':'Adversarial evaluation','C45':'Independent review','C46':'Release and reproduction'},'2. Detailed budget':{}};
const d=map['2. Detailed budget'];
Object.assign(d,{C15:'In post',D15:'Brazil',E15:'Rafael Oliveira - research lead (estimated)',F15:48000,G15:1,H15:'WP1',C16:'In post',D16:'Brazil',E16:'Jameson Bednarski - researcher (location/FTE to confirm)',F16:42000,G16:0.5,H16:'WP4'});
// No asserted country for Jameson. Keep his location blank until confirmed.
d.D16=null;
const ext=[{r:48,t:'ARIA programme travel - two trips; estimated',v:[3000,0,0,3000,0,0],wp:'WP1'},
{r:123,t:'Metered compute - planning allowance',v:[800,800,800,800,800,800],wp:'WP4'},
{r:142,t:'Project-specific IP/licence review; quote pending',v:[2000,0,0,0,0,0],wp:'WP1'},
{r:143,t:'Independent accountant report; grant allowance',v:[0,0,0,0,0,2500],wp:'WP6'},
{r:161,t:'Rust/security implementation: 120 days x GBP500; estimate',v:[10000,10000,10000,10000,10000,10000],wp:'WP2'},
{r:162,t:'Evaluation/integration: 40 days x GBP450; estimate',v:[0,0,4500,4500,4500,4500],wp:'WP4'},
{r:163,t:'Independent security review: 15 days x GBP800; estimate',v:[0,0,0,0,12000,0],wp:'WP5'}];
for(const e of ext){d['C'+e.r]=e.t;d['H'+e.r]=e.wp;if(e.r>=161)d['F'+e.r]='TBD - no supplier appointed';for(let i=0;i<6;i++)d[String.fromCharCode(73+i)+e.r]=e.v[i];}
await fs.writeFile('../edits.json',JSON.stringify(map,null,2));
await fs.writeFile('../totals.json',JSON.stringify({employee:34500,external:105300,overhead:13890,total:153690,rafaelMonthly:4000,jamesonMonthly:1750}));
console.log('Created planning workbook and official-template input map.');

