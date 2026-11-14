// Recreate the bundled replay from the original, credited numeric CSV.
import {readFileSync,writeFileSync} from 'node:fs';
const lines=readFileSync('research-data/health/bidmc_01_Numerics.csv','utf8').trim().split(/\r?\n/);
const headers=lines.shift().split(',').map(x=>x.trim());
const columns=['Time [s]','HR','RESP','SpO2'].map(x=>headers.indexOf(x));
if(columns.some(x=>x<0))throw Error('Unexpected BIDMC columns');
const samples=lines.map(line=>{const cells=line.split(',');return columns.map(i=>{const n=Number(cells[i].trim());return Number.isFinite(n)?n:null;});});
if(samples.length!==481||samples.some((s,i)=>s[0]!==i))throw Error('Expected complete 0–480 second time axis');
writeFileSync('src/lib/healthReference.json',JSON.stringify({record:'bidmc01',source:'https://physionet.org/files/bidmc/1.0.0/bidmc_csv/bidmc_01_Numerics.csv',license:'ODC-By-1.0',licenseUrl:'https://opendatacommons.org/licenses/by/1-0/',attribution:'BIDMC PPG and Respiration Dataset, Pimentel, Johnson, Charlton and Clifton; PhysioNet, DOI 10.13026/C2208R',columns:['seconds','heartRate','respiratoryRate','bloodOxygen'],samples}));
console.log(`Prepared ${samples.length} source samples; missing values preserved as null.`);
