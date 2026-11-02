/* Centerline tracing: threshold -> thinning -> graph paths -> simplification. */
(function(root){
  'use strict';
  function simplify(points,tolerance=.65){
    if(points.length<3)return points;
    const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
    const stack=[[0,points.length-1]],limit=tolerance*tolerance;
    while(stack.length){const [a,b]=stack.pop(),[ax,ay]=points[a],[bx,by]=points[b];let best=limit,index=-1;
      const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
      for(let i=a+1;i<b;i++){const [x,y]=points[i],t=len?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/len)):0;
        const d=(x-ax-t*dx)**2+(y-ay-t*dy)**2;if(d>best){best=d;index=i}}
      if(index>=0){keep[index]=1;stack.push([a,index],[index,b])}
    }
    return points.filter((_,i)=>keep[i]);
  }
  function length(points){let n=0;for(let i=1;i<points.length;i++)n+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return n}
  function orderPaths(paths){
    const pool=paths.map(p=>p.slice()),ordered=[];let end=[0,0];
    while(pool.length){let best=Infinity,index=0,reverse=false;
      for(let i=0;i<pool.length;i++){const p=pool[i];for(const r of [false,true]){const q=r?p.at(-1):p[0],d=(q[0]-end[0])**2+(q[1]-end[1])**2;if(d<best){best=d;index=i;reverse=r}}}
      const p=pool.splice(index,1)[0];if(reverse)p.reverse();ordered.push(p);end=p.at(-1);
    }return ordered;
  }
  function trace({data,width:w,height:h,threshold=170,minLength=5,invert=false,mode='lines',binary=null}){
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||w>1024||h>1024||data.length!==w*h*4)throw Error('Dimensões inválidas.');
    const gray=new Float32Array(w*h),mask=new Uint8Array(w*h);
    for(let i=0;i<gray.length;i++){const a=data[i*4+3]/255;gray[i]=(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2])*a+255*(1-a)}
    let black=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;let on;
      if(binary){on=!!binary[i]}else if(mode==='edges'){
        const gx=-gray[i-w-1]+gray[i-w+1]-2*gray[i-1]+2*gray[i+1]-gray[i+w-1]+gray[i+w+1];
        const gy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];
        on=Math.hypot(gx,gy)>Math.max(20,(255-threshold)*2);
      }else on=(invert?255-gray[i]:gray[i])<threshold;
      if(on){mask[i]=1;black++}
    }
    // Parallel deletion in two phases retains connectivity of dark strokes.
    let changed=true,round=0;
    while(changed&&round++<512){changed=false;
      for(let phase=0;phase<2;phase++){const remove=[];
        for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!mask[i])continue;
          const n=[mask[i-w],mask[i-w+1],mask[i+1],mask[i+w+1],mask[i+w],mask[i+w-1],mask[i-1],mask[i-w-1]];
          const count=n.reduce((a,b)=>a+b,0);if(count<2||count>6)continue;
          let transitions=0;for(let j=0;j<8;j++)if(!n[j]&&n[(j+1)%8])transitions++;
          if(transitions!==1)continue;
          if(phase===0?(n[0]*n[2]*n[4]||n[2]*n[4]*n[6]):(n[0]*n[2]*n[6]||n[0]*n[4]*n[6]))continue;
          remove.push(i);
        }
        if(remove.length){changed=true;for(const i of remove)mask[i]=0}
      }
    }
    const neighbors=i=>{const out=[],x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
      if(dx&&dy&&(mask[i+dx]||mask[i+dy*w]))continue;
      const j=ny*w+nx;if(mask[j])out.push(j);
    }return out};
    const degrees=new Uint8Array(mask.length),pixels=[];for(let i=0;i<mask.length;i++)if(mask[i]){pixels.push(i);degrees[i]=neighbors(i).length}
    const visited=new Set(),paths=[],edge=(a,b)=>Math.min(a,b)*mask.length+Math.max(a,b);
    function walk(start,next){const ids=[start];let a=start,b=next;while(true){visited.add(edge(a,b));ids.push(b);if(degrees[b]!==2||b===start)break;const n=neighbors(b).find(v=>v!==a&&!visited.has(edge(b,v)));if(n===undefined)break;a=b;b=n}
      const points=ids.map(i=>[i%w,Math.floor(i/w)]);if(length(points)>=minLength)paths.push(simplify(points));
    }
    for(const i of pixels)if(degrees[i]!==2)for(const j of neighbors(i))if(!visited.has(edge(i,j)))walk(i,j);
    for(const i of pixels)for(const j of neighbors(i))if(!visited.has(edge(i,j)))walk(i,j);
    const tooComplex=paths.length>1600;const filtered=tooComplex?paths.sort((a,b)=>length(b)-length(a)).slice(0,1600):paths;
    const ordered=orderPaths(filtered).map(p=>p.map(([x,y])=>[+(x/w*100).toFixed(3),+(y/w*100).toFixed(3)]));
    return {paths:ordered,aspect:h/w,coverage:black/(w*h),limited:tooComplex,points:ordered.reduce((n,p)=>n+p.length,0)};
  }
  const api={trace,simplify,orderPaths,length};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TraceEngine=api;
})(typeof self!=='undefined'?self:globalThis);
