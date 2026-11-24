import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { sourceFiles } from './source';

const files = await sourceFiles();
// Deterministic spread across the entire source, not just one easy category.
const sample = Array.from({length:256},(_,i)=>files[Math.floor(i*files.length/256)]);
const meta = await sharp(sample[0].absolute).metadata();
const size = meta.width!;
const raw = await Promise.all(sample.map(f=>sharp(f.absolute).resize(size,size).removeAlpha().raw().toBuffer()));
const quality=78;
const individual = await Promise.all(sample.map(f=>sharp(f.absolute).webp({quality,effort:5}).toBuffer()));
let mse=0;
for(let i=0;i<sample.length;i++) {
  const decoded=await sharp(individual[i]).removeAlpha().raw().toBuffer();
  for(let p=0;p<decoded.length;p++) mse+=(decoded[p]-raw[i][p])**2;
}
mse/=raw.reduce((s,b)=>s+b.length,0);
const formats: {format:string;files:number;bytes:number;decodedRgbaBytes:number;singleScatteredResultDecodeBytes:number}[]=[
  {format:'Original JPG',files:256,bytes:sample.reduce((s,f)=>s+f.bytes,0),decodedRgbaBytes:256*size*size*4,singleScatteredResultDecodeBytes:size*size*4},
  {format:'Individual WebP q78',files:256,bytes:individual.reduce((s,b)=>s+b.length,0),decodedRgbaBytes:256*size*size*4,singleScatteredResultDecodeBytes:size*size*4},
];
await mkdir('docs',{recursive:true});
for(const columns of [8,16]) {
  const count=columns**2;
  let bytes=0;
  for(let start=0;start<sample.length;start+=count) {
    const composite=raw.slice(start,start+count).map((input,i)=>({input,raw:{width:size,height:size,channels:3 as const},left:i%columns*size,top:Math.floor(i/columns)*size}));
    const buffer=await sharp({create:{width:columns*size,height:columns*size,channels:3,background:'#151719'}}).composite(composite).webp({quality,effort:5}).toBuffer();
    bytes+=buffer.length;
    if(start===0) await Bun.write(`docs/atlas-${count}-sample.webp`,buffer);
  }
  formats.push({format:`${count}-icon WebP atlas q78`,files:sample.length/count,bytes,decodedRgbaBytes:256*size*size*4,singleScatteredResultDecodeBytes:count*size*size*4});
}
const report={sample:256,sampleMethod:'Evenly spaced sorted source files',nativeSize:size,quality,individualWebPPsnrDb:10*Math.log10(255**2/mse),formats,decision:'64-icon atlases balance grouped browsing request count with less overfetch/decoded memory for scattered search and favorites than 256-icon atlases. Browser measurements reported separately.'};
await Bun.write('docs/image-benchmark.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
