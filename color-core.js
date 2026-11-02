/* Colored drawings use a separate outline plus an ordered reveal of source pixels. */
(function(root){
  'use strict';
  const engine=typeof module!=='undefined'&&module.exports?require('./trace-core.js'):root.TraceEngine;
  function background(data,w,h,remove=true){
    const n=w*h,out=new Uint8Array(n);if(!remove)return out;
    const queue=new Int32Array(n);let head=0,tail=0;
    const eligible=i=>data[i*4+3]<12||(data[i*4]>239&&data[i*4+1]>239&&data[i*4+2]>239);
    const add=i=>{if(!out[i]&&eligible(i)){out[i]=1;queue[tail++]=i}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x)}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1)}
    while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<n-w)add(i+w)}
    return out;
  }
  function clearBackground(data,w,h,remove){const mask=background(data,w,h,remove);for(let i=0;i<mask.length;i++)if(mask[i])data[i*4+3]=0;return data}
  // Edge flood of the backdrop color. Separate from the white-only clear and from layer cutting.
  function removeBackdrop(data,w,h){
    const n=w*h;if(!n||data.length<n*4)return 0;
    const samples=[];const step=Math.max(1,Math.floor(Math.max(w,h)/100));
    const take=i=>{if(data[i*4+3]>200)samples.push([data[i*4],data[i*4+1],data[i*4+2]])};
    for(let x=0;x<w;x+=step){take(x);take((h-1)*w+x)}
    for(let y=0;y<h;y+=step){take(y*w);take(y*w+w-1)}
    if(samples.length<8)return 0;
    const channel=k=>{const v=samples.map(s=>s[k]).sort((a,b)=>a-b);return v[v.length>>1]};
    const mr=channel(0),mg=channel(1),mb=channel(2),bl=.2126*mr+.7152*mg+.0722*mb;
    let variance=0;for(const s of samples)variance+=(s[0]-mr)**2+(s[1]-mg)**2+(s[2]-mb)**2;variance/=samples.length;
    const smooth=variance<8000,limit=smooth?48*48:18*18,stepLimit=26*26,drift=smooth?90*90:limit;
    const nearWhite=(r,g,b)=>{const luma=.2126*r+.7152*g+.0722*b,chroma=Math.max(r,g,b)-Math.min(r,g,b);return(luma>214&&chroma<32)||(r>234&&g>234&&b>234)};
    const stats=i=>{const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];return{r,g,b,a,luma:.2126*r+.7152*g+.0722*b,d:(r-mr)**2+(g-mg)**2+(b-mb)**2}};
    const eligible=i=>{const p=stats(i);if(p.a<16||nearWhite(p.r,p.g,p.b))return true;if(p.d>limit)return false;if(bl-p.luma>42)return false;return true};
    const canGrow=(i,from)=>{if(eligible(i))return true;if(!smooth)return false;const p=stats(i);if(p.a<16)return true;if(bl-p.luma>36||p.d>drift)return false;const dr=p.r-data[from*4],dg=p.g-data[from*4+1],db=p.b-data[from*4+2];return dr*dr+dg*dg+db*db<=stepLimit};
    const bg=new Uint8Array(n),q=new Int32Array(n);let head=0,tail=0;
    const add=(i,from)=>{if(!bg[i]&&(from<0?eligible(i):canGrow(i,from))){bg[i]=1;q[tail++]=i}};
    for(let x=0;x<w;x++){add(x,-1);add((h-1)*w+x,-1)}
    for(let y=0;y<h;y++){add(y*w,-1);add(y*w+w-1,-1)}
    while(head<tail){const i=q[head++],x=i%w;if(x)add(i-1,i);if(x+1<w)add(i+1,i);if(i>=w)add(i-w,i);if(i+w<n)add(i+w,i)}
    let removed=0;for(let i=0;i<n;i++)if(bg[i]&&data[i*4+3]){data[i*4+3]=0;removed++}return removed;
  }
  function prepare({data,width:w,height:h,threshold=170,minLength=5,removeBackground=true}){
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||w>1024||h>1024||data.length!==w*h*4)throw Error('Dimensões inválidas.');
    const n=w*h,bg=background(data,w,h,removeBackground),fg=new Uint8Array(n),gray=new Float32Array(n),integral=new Float64Array((w+1)*(h+1));
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x,a=data[i*4+3]/255;fg[i]=!bg[i]&&a>.03?1:0;gray[i]=(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2])*a+255*(1-a);row+=gray[i];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+row}}
    // Local darkness detects ink rather than mistaking solid hair/clothing for a stroke.
    const binary=new Uint8Array(n),radius=Math.max(3,Math.round(Math.max(w,h)/160)),contrast=4+(245-threshold)*.12;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!fg[i])continue;const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius+1);
      const mean=(integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
      if(gray[i]<mean-contrast)binary[i]=1;
    }
    const traced=engine.trace({data,width:w,height:h,threshold,minLength,binary});
    // Color quantization affects painting order only; the displayed colors remain original.
    const histogram=new Map();for(let i=0;i<n;i++)if(fg[i]){const r=data[i*4]>>4,g=data[i*4+1]>>4,b=data[i*4+2]>>4,key=(r<<8)|(g<<4)|b;histogram.set(key,(histogram.get(key)||0)+1)}
    const bins=[...histogram].map(([key,count])=>({rgb:[((key>>8)&15)*16+8,((key>>4)&15)*16+8,(key&15)*16+8],count})).sort((a,b)=>b.count-a.count);
    if(!bins.length)return{...traced,color:true,paint:{width:w,height:h,runs:[],regions:0,pixels:0},coverage:0};
    const palette=[bins[0].rgb.slice()],distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
    while(palette.length<Math.min(14,bins.length)){let chosen=null,score=0;for(const bin of bins){const s=Math.min(...palette.map(p=>distance(p,bin.rgb)))*Math.sqrt(bin.count);if(s>score){score=s;chosen=bin.rgb}}if(!chosen||score<2)break;palette.push(chosen.slice())}
    function closest(rgb){let best=Infinity,index=0;for(let j=0;j<palette.length;j++){const d=distance(rgb,palette[j]);if(d<best){best=d;index=j}}return index}
    for(let it=0;it<5;it++){const sums=palette.map(()=>[0,0,0,0]);for(const bin of bins){const s=sums[closest(bin.rgb)];for(let k=0;k<3;k++)s[k]+=bin.rgb[k]*bin.count;s[3]+=bin.count}for(let j=0;j<palette.length;j++)if(sums[j][3])palette[j]=sums[j].slice(0,3).map(v=>v/sums[j][3])}
    const labels=new Int16Array(n);labels.fill(-1);const lookup=new Map();for(const bin of bins){const rgb=bin.rgb,key=((rgb[0]>>4)<<8)|((rgb[1]>>4)<<4)|(rgb[2]>>4);lookup.set(key,closest(rgb))}
    for(let i=0;i<n;i++)if(fg[i])labels[i]=lookup.get(((data[i*4]>>4)<<8)|((data[i*4+1]>>4)<<4)|(data[i*4+2]>>4));
    const components=new Int32Array(n);components.fill(-1);const queue=new Int32Array(n),regions=[];
    for(let i=0;i<n;i++){if(!fg[i]||components[i]>=0)continue;const id=regions.length,label=labels[i];let head=0,tail=1;queue[0]=i;components[i]=id;let minX=w,minY=h;
      while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);minY=Math.min(minY,y);const neighbors=[];if(x)neighbors.push(p-1);if(x<w-1)neighbors.push(p+1);if(y)neighbors.push(p-w);if(y<h-1)neighbors.push(p+w);for(const q of neighbors)if(components[q]<0&&labels[q]===label){components[q]=id;queue[tail++]=q}}
      regions.push({id,size:tail,x:minX,y:minY,label});
    }
    // Merge tiny islands into adjacent main regions, retaining every foreground pixel.
    const major=regions.filter(r=>r.size>=Math.max(12,n/15000)).sort((a,b)=>b.size-a.size).slice(0,300);if(!major.length&&regions.length)major.push(regions.reduce((a,b)=>a.size>b.size?a:b));
    const keep=new Set(major.map(r=>r.id)),mapped=new Int32Array(n);mapped.fill(-1);let head=0,tail=0;
    for(let i=0;i<n;i++)if(keep.has(components[i])){mapped[i]=components[i];queue[tail++]=i}
    while(head<tail){const i=queue[head++],x=i%w;const ns=[];if(x)ns.push(i-1);if(x<w-1)ns.push(i+1);if(i>=w)ns.push(i-w);if(i<n-w)ns.push(i+w);for(const j of ns)if(fg[j]&&mapped[j]<0){mapped[j]=mapped[i];queue[tail++]=j}}
    const leftovers=regions.length;for(let i=0;i<n;i++)if(fg[i]&&mapped[i]<0)mapped[i]=leftovers;
    const buckets=new Map();let pixels=0;
    for(let y=0;y<h;y++){let x=0;while(x<w){const id=mapped[y*w+x];if(id<0){x++;continue}const start=x;while(x<w&&mapped[y*w+x]===id)x++;const label=regions[id]?.label??0,run=[start,y,x-start,y%2?1:0,label];if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(run);pixels+=x-start}}
    const ordered=[...buckets.keys()].sort((a,b)=>{const aa=regions[a]||{x:w,y:h},bb=regions[b]||{x:w,y:h};return Math.floor(aa.x/(w/4))-Math.floor(bb.x/(w/4))||aa.y-bb.y||aa.x-bb.x});
    const runs=[];for(const id of ordered){const rows=buckets.get(id);let row=[];let y=-1;const flush=()=>{if(y%2)row.reverse();runs.push(...row);row=[]};for(const run of rows){if(run[1]!==y){flush();y=run[1]}row.push(run)}flush()}
    return {...traced,color:true,paint:{width:w,height:h,runs,regions:buckets.size,pixels,palette:palette.map(rgb=>rgb.map(v=>Math.max(0,Math.min(255,Math.round(v)))))},coverage:pixels/n};
  }
  const api={prepare,background,clearBackground,removeBackdrop};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ColorEngine=api;
})(typeof self!=='undefined'?self:globalThis);
