/* Construction sketch: gesture, masses, and a mannequin when the silhouette is a person. */
(function(root){
  'use strict';
  const GESTURE='#c24b3a', BUILD='#2a5f99', MASS='#6d8f4e';

  function hypot(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
  function len(pts){let n=0;for(let i=1;i<pts.length;i++)n+=hypot(pts[i],pts[i-1]);return n}
  function lerp(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}
  function dedupe(pts){const out=[];for(const p of pts){const q=[+p[0].toFixed(2),+p[1].toFixed(2)];if(!out.length||hypot(out[out.length-1],q)>0.35)out.push(q)}if(pts.length>1&&(out.length<2||hypot(out[out.length-1],pts[pts.length-1])>0.2))out.push([+pts[pts.length-1][0].toFixed(2),+pts[pts.length-1][1].toFixed(2)]);return out.length>=2?out:pts.slice(0,2)}
  function ellipse(cx,cy,rx,ry,n){const pts=[];const steps=n||24;for(let i=0;i<=steps;i++){const t=i/steps*Math.PI*2;pts.push([cx+Math.cos(t)*rx,cy+Math.sin(t)*ry])}return pts}
  function chaikin(pts){if(pts.length<3)return pts;const out=[pts[0]];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];out.push(lerp(a,b,.25),lerp(a,b,.75))}out.push(pts[pts.length-1]);return out}
  function twin(pts,mag){if(pts.length<2||mag<=0)return [pts];const off=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;return [p[0]-dy*mag,p[1]+dx*mag]});return [pts,off]}
  function flood(pass,w,h){const n=w*h,out=new Uint8Array(n),q=new Int32Array(n);let head=0,tail=0;const add=i=>{if(!out[i]&&pass[i]){out[i]=1;q[tail++]=i}};for(let x=0;x<w;x++){add(x);add((h-1)*w+x)}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1)}while(head<tail){const i=q[head++],x=i%w;if(x)add(i-1);if(x+1<w)add(i+1);if(i>=w)add(i-w);if(i+w<n)add(i+w)}return out}
  function dilate(mask,w,h,r){const out=new Uint8Array(mask.length),r2=r*r;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!mask[y*w+x])continue;for(let dy=-r;dy<=r;dy++){const ny=y+dy;if(ny<0||ny>=h)continue;for(let dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r2)continue;const nx=x+dx;if(nx<0||nx>=w)continue;out[ny*w+nx]=1}}}return out}
  function downsample(data,w,h,max){const scale=Math.min(1,max/w,max/h);if(scale===1)return {data,w,h};const sw=Math.max(12,Math.round(w*scale)),sh=Math.max(12,Math.round(h*scale)),out=new Uint8ClampedArray(sw*sh*4);for(let y=0;y<sh;y++){const y0=Math.floor(y*h/sh),y1=Math.max(y0+1,Math.floor((y+1)*h/sh));for(let x=0;x<sw;x++){const x0=Math.floor(x*w/sw),x1=Math.max(x0+1,Math.floor((x+1)*w/sw));let r=0,g=0,b=0,a=0,c=0;for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*w+xx)*4;r+=data[i];g+=data[i+1];b+=data[i+2];a+=data[i+3];c++}const o=(y*sw+x)*4;out[o]=r/c;out[o+1]=g/c;out[o+2]=b/c;out[o+3]=a/c}}return {data:out,w:sw,h:sh}}
  function paperMask(data,w,h){const n=w*h,paper=new Uint8Array(n);const samples=[];const take=i=>{if(data[i*4+3]>200)samples.push([data[i*4],data[i*4+1],data[i*4+2]])};for(let x=0;x<w;x++){take(x);take((h-1)*w+x)}for(let y=0;y<h;y++){take(y*w);take(y*w+w-1)}let flat=false,mr=255,mg=255,mb=255;if(samples.length>8){mr=0;mg=0;mb=0;for(const s of samples){mr+=s[0];mg+=s[1];mb+=s[2]}mr/=samples.length;mg/=samples.length;mb/=samples.length;let v=0;for(const s of samples)v+=(s[0]-mr)**2+(s[1]-mg)**2+(s[2]-mb)**2;flat=v/samples.length<700}for(let i=0;i<n;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];if(a<16){paper[i]=1;continue}const luma=.2126*r+.7152*g+.0722*b,chroma=Math.max(r,g,b)-Math.min(r,g,b);if((luma>214&&chroma<28)||(r>234&&g>234&&b>234)){paper[i]=1;continue}if(flat&&(r-mr)**2+(g-mg)**2+(b-mb)**2<46*46)paper[i]=1}return paper}
  function closeFill(ink,w,h){const n=w*h;const radii=[Math.max(3,Math.round(Math.min(w,h)/16)),Math.max(2,Math.round(Math.min(w,h)/28)),1];let best=null,bestCov=1;for(const r of radii){const closed=dilate(ink,w,h,r),pass=new Uint8Array(n);for(let i=0;i<n;i++)pass[i]=closed[i]?0:1;const ext=flood(pass,w,h),mass=new Uint8Array(n);let count=0;for(let i=0;i<n;i++)if(!ext[i]){mass[i]=1;count++}const cov=count/n;if(cov>0.012&&cov<0.9)return mass;if(cov<bestCov&&cov<0.98){bestCov=cov;best=mass}}return best}
  function massMask(data,w,h){const n=w*h,paper=paperMask(data,w,h),ink=new Uint8Array(n);let solid=0,inkCount=0;for(let i=0;i<n;i++){if(paper[i])continue;solid++;const r=data[i*4],g=data[i*4+1],b=data[i*4+2];const luma=.2126*r+.7152*g+.0722*b,chroma=Math.max(r,g,b)-Math.min(r,g,b);if(luma<198||chroma>30){ink[i]=1;inkCount++}}const lineArt=solid<n*.1||(solid>0&&inkCount>solid*.68);if(!lineArt){const ext=flood(paper,w,h),mass=new Uint8Array(n);let count=0;for(let i=0;i<n;i++)if(!ext[i]){mass[i]=1;count++}if(count/n<=.9||inkCount<n*.01)return mass}return closeFill(ink,w,h)||ink}
  function components(mask,w,h,limit=6,minFrac=0.008){const n=w*h,seen=new Uint8Array(n),q=new Int32Array(n),out=[];for(let start=0;start<n;start++){if(!mask[start]||seen[start])continue;let head=0,tail=1;q[0]=start;seen[start]=1;let minX=w,minY=h,maxX=0,maxY=0;const pixels=[];while(head<tail){const i=q[head++],x=i%w,y=(i-x)/w;pixels.push(i);if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(x&&mask[i-1]&&!seen[i-1]){seen[i-1]=1;q[tail++]=i-1}if(x+1<w&&mask[i+1]&&!seen[i+1]){seen[i+1]=1;q[tail++]=i+1}if(y&&mask[i-w]&&!seen[i-w]){seen[i-w]=1;q[tail++]=i-w}if(y+1<h&&mask[i+w]&&!seen[i+w]){seen[i+w]=1;q[tail++]=i+w}}if(pixels.length<Math.max(24,n*minFrac))continue;out.push({pixels,minX,minY,maxX,maxY,size:pixels.length})}out.sort((a,b)=>b.size-a.size);return out.slice(0,limit)}
  function erode(mask,w,h,r){const out=new Uint8Array(mask.length),r2=r*r;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!mask[y*w+x])continue;let ok=1;for(let dy=-r;dy<=r&&ok;dy++)for(let dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r2)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h||!mask[ny*w+nx])ok=0}if(ok)out[y*w+x]=1}return out}
  function regrow(mask,seeds,w,h){const n=w*h,label=new Int16Array(n);label.fill(-1);const q=new Int32Array(n);let tail=0;seeds.forEach((comp,id)=>{for(const i of comp.pixels)if(mask[i]&&label[i]<0){label[i]=id;q[tail++]=i}});let head=0;while(head<tail){const i=q[head++],x=i%w;const ns=[];if(x)ns.push(i-1);if(x+1<w)ns.push(i+1);if(i>=w)ns.push(i-w);if(i+w<n)ns.push(i+w);for(const j of ns)if(mask[j]&&label[j]<0){label[j]=label[i];q[tail++]=j}}const groups=seeds.map(()=>({pixels:[],minX:w,minY:h,maxX:0,maxY:0,size:0}));for(let i=0;i<n;i++)if(label[i]>=0){const g=groups[label[i]],x=i%w,y=(i/w)|0;g.pixels.push(i);g.size++;if(x<g.minX)g.minX=x;if(x>g.maxX)g.maxX=x;if(y<g.minY)g.minY=y;if(y>g.maxY)g.maxY=y}return groups.filter(g=>g.size>=Math.max(24,n*0.003)).sort((a,b)=>b.size-a.size).slice(0,8)}
  function runsOf(xs){if(!xs.length)return [];xs.sort((a,b)=>a-b);const runs=[];let s=xs[0],e=xs[0];for(let i=1;i<xs.length;i++){if(xs[i]<=e+2)e=xs[i];else{runs.push([s,e]);s=e=xs[i]}}runs.push([s,e]);return runs}
  function median(values){if(!values.length)return 0;const v=values.slice().sort((a,b)=>a-b);return v[v.length>>1]}
  function blur(arr,r){const out=arr.slice();for(let i=0;i<arr.length;i++){if(!arr[i])continue;let s=0,c=0;for(let k=-r;k<=r;k++){const j=i+k;if(j<0||j>=arr.length||!arr[j])continue;s+=arr[j];c++}if(c)out[i]=s/c}return out}

  function fitFigure(comp,w,h){
    const Hspan=comp.maxY-comp.minY+1,Wspan=comp.maxX-comp.minX+1;
    if(Hspan<22||Wspan<8)return null;
    const aspect=Hspan/Wspan;if(aspect<.72||aspect>6.2)return null;
    const mask=new Uint8Array(w*h);for(const i of comp.pixels)mask[i]=1;
    const rows=Array.from({length:h},()=>[]);for(const i of comp.pixels)rows[(i/w)|0].push(i%w);
    const rowRuns=rows.map(runsOf);
    const fullL=new Array(h).fill(-1),fullR=new Array(h).fill(-1),coreW=new Array(h).fill(0),coreL=new Array(h).fill(0),coreR=new Array(h).fill(0);
    let sumX=0;for(const i of comp.pixels)sumX+=i%w;const refX=sumX/comp.pixels.length;
    for(let y=comp.minY;y<=comp.maxY;y++){const runs=rowRuns[y];if(!runs.length)continue;fullL[y]=runs[0][0];fullR[y]=runs[runs.length-1][1];let core=runs[0],best=Infinity;for(const run of runs){const d=Math.abs((run[0]+run[1])/2-refX);if(d<best){best=d;core=run}}coreL[y]=core[0];coreR[y]=core[1];coreW[y]=core[1]-core[0]+1}
    const width=blur(fullR.map((right,y)=>right>=0?right-fullL[y]+1:0),2);
    const y0=comp.minY,y1=comp.maxY,H=y1-y0;
    let headTop=y0;for(let y=y0;y<=y1;y++)if(width[y]>Wspan*.1){headTop=y;break}
    const searchTo=Math.min(y1-4,Math.round(headTop+H*.4));
    let neckY=-1,neckWd=Infinity;for(let y=Math.round(headTop+Math.max(3,H*.07));y<=searchTo;y++){const wd=coreW[y]||width[y];if(wd&&wd<neckWd){neckWd=wd;neckY=y}}
    if(neckY<0)return null;
    let headW=0,headCx=0,headN=0;for(let y=headTop;y<neckY;y++){headW=Math.max(headW,width[y]);for(const x of rows[y]){headCx+=x;headN++}}
    if(!headN||headW<3)return null;headCx/=headN;
    let headH=neckY-headTop;
    let shoulderW=0,probeY=neckY;for(let y=neckY;y<=Math.min(y1,Math.round(neckY+Math.max(6,headH)));y++)if(width[y]>shoulderW){shoulderW=width[y];probeY=y}
    let below=y1-neckY;
    let passed=neckWd<headW*.94&&shoulderW>neckWd*1.12&&below>H*.32&&headH>H*.07&&headH<H*.5&&fullL[probeY]>=0&&Math.abs(headCx-(fullL[probeY]+fullR[probeY])/2)<shoulderW*.6;
    if(!passed){
      if(aspect<1.12||aspect>5.6)return null;
      const bandMean=(a,b)=>{let s=0,c=0;for(let y=Math.max(y0,Math.round(y0+H*a));y<=Math.min(y1,Math.round(y0+H*b));y++)if(coreW[y]){s+=coreW[y];c++}return c?s/c:0};
      const top=bandMean(0,.22),mid=bandMean(.28,.55),bot=bandMean(.62,.95);
      if(!(top>3&&mid>top*1.12&&bot>top*.8))return null;
      let split=false;for(let y=Math.round(y0+H*.55);y<=y1;y++)if((rowRuns[y]||[]).length>=2){split=true;break}
      if(Math.max(top,mid,bot)<Math.min(top,mid,bot)*1.28&&!split)return null;
      headTop=y0;for(let y=y0;y<=y1;y++)if(width[y]>Wspan*.08){headTop=y;break}
      headH=Math.max(6,Math.round(H*.2));neckY=Math.min(y1-4,headTop+headH);
      headW=0;headCx=0;headN=0;for(let y=headTop;y<neckY;y++){headW=Math.max(headW,width[y]);for(const x of rows[y]){headCx+=x;headN++}}
      if(!headN||headW<3)return null;headCx/=headN;
      neckWd=coreW[neckY]||width[neckY]||headW;shoulderW=0;probeY=neckY;
      for(let y=neckY;y<=Math.min(y1,neckY+headH);y++)if(width[y]>shoulderW){shoulderW=width[y];probeY=y}
      below=y1-neckY;if(below<H*.25||fullL[probeY]<0)return null;
    }
    // Shoulder width stays on the ribcage. The widest row is often the hands, not the joint.
    const bandMin=(yA,yB)=>{let m=Infinity;for(let y=Math.max(y0,Math.round(yA));y<=Math.min(y1,Math.round(yB));y++)if(coreW[y]&&coreW[y]<m)m=coreW[y];return m===Infinity?headW*2:m};
    const shoulderY=Math.min(y1-6,Math.round(neckY+Math.max(3,headH*.55)));
    const torsoW=Math.max(headW*1.05,Math.min(headW*2.6,bandMin(neckY+headH*.28,neckY+headH*.95)));
    const torsoSamples=[];for(let y=shoulderY;y<=Math.min(y1,shoulderY+headH*2);y++)if(coreW[y])torsoSamples.push((coreL[y]+coreR[y])/2);
    const torsoMid=torsoSamples.length?median(torsoSamples):headCx;
    const shL=[torsoMid-torsoW/2,shoulderY],shR=[torsoMid+torsoW/2,shoulderY];
    let crotch=-1;for(let y=Math.round(y0+H*.4);y<=Math.round(y0+H*.84);y++){const runs=rowRuns[y];if(runs.length<2)continue;let split=false;for(let i=1;i<runs.length;i++){const gapL=runs[i-1][1],gapR=runs[i][0];if(gapR-gapL>=3&&refX>=gapL-1&&refX<=gapR+1&&runs[i-1][1]-runs[i-1][0]>2&&runs[i][1]-runs[i][0]>2)split=true}if(!split)continue;let persist=0;for(let k=0;k<5&&y+k<=y1;k++){const rr=rowRuns[y+k];for(let i=1;i<rr.length;i++)if(rr[i][0]-rr[i-1][1]>=3&&refX>=rr[i-1][1]-1&&refX<=rr[i][0]+1)persist++}if(persist>=3){crotch=y;break}}
    const hipY=Math.round(crotch>0?Math.max(shoulderY+headH*.45,crotch-Math.max(2,H*.02)):Math.min(y1-2,Math.round(y0+H*.58)));
    const hipCore=Math.max(torsoW*.78,Math.min(torsoW*1.25,bandMin(hipY-headH*.35,hipY)));
    const hipCx=torsoMid;
    const hipL=[hipCx-hipCore/2,hipY],hipR=[hipCx+hipCore/2,hipY];
    const headCy=(headTop+neckY)/2,rx=Math.max(3,headW*.52),ry=Math.max(3,headH*.58);
    const sideX=(y,side)=>{const yy0=Math.max(y0,Math.min(y1,Math.round(y)));for(let d=0;d<=H;d++){for(const cand of [yy0+d,yy0-d]){if(cand<y0||cand>y1)continue;const x=side<0?fullL[cand]:fullR[cand];if(x>=0)return x}}return side<0?shL[0]:shR[0]};
    function bend(origin,extreme,pixels){let best=null,score=Math.max(3,H*.035);const ax=origin[0],ay=origin[1],bx=extreme[0],by=extreme[1],dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy||1;for(const p of pixels){const t=Math.max(0,Math.min(1,((p[0]-ax)*dx+(p[1]-ay)*dy)/den));const d=Math.hypot(p[0]-ax-t*dx,p[1]-ay-t*dy);if(d>score){score=d;best=p}}return best||lerp(origin,extreme,.5)}
    function arm(side){const joint=side<0?shL:shR;const pixels=[];const yA=Math.max(y0,shoulderY-H*.22),yB=Math.min(y1,hipY+H*.06);for(let y=Math.round(yA);y<=Math.round(yB);y++)for(let x=comp.minX;x<=comp.maxX;x++){if(!mask[y*w+x])continue;if(side<0&&x<joint[0]-1.5)pixels.push([x,y]);else if(side>0&&x>joint[0]+1.5)pixels.push([x,y])}if(pixels.length<8){const wristY=Math.min(y1,hipY),elbowY=(shoulderY+wristY)/2;return [joint,[sideX(elbowY,side),elbowY],[sideX(wristY,side),wristY]]}let wrist=pixels[0],best=-1;for(const p of pixels){const d=(p[0]-joint[0])**2+(p[1]-joint[1])**2;if(d>best){best=d;wrist=p}}return [joint,bend(joint,wrist,pixels),wrist]}
    function leg(side){const joint=side<0?hipL:hipR;const pixels=[];for(let y=hipY;y<=y1;y++){const runs=rowRuns[y]||[];for(const run of runs){const cx=(run[0]+run[1])/2;if(side<0&&cx<=hipCx+1)for(let x=run[0];x<=run[1];x++)pixels.push([x,y]);if(side>0&&cx>=hipCx-1)for(let x=run[0];x<=run[1];x++)pixels.push([x,y])}}if(pixels.length<6)return [joint,[joint[0],(joint[1]+y1)/2],[joint[0],y1]];const yCut=hipY+(y1-hipY)*.8;let sx=0,sy=0,sc=0;for(const p of pixels)if(p[1]>=yCut){sx+=p[0];sy+=p[1];sc++}const ankle=sc?[sx/sc,sy/sc]:[joint[0],y1];const yKnee=joint[1]+(ankle[1]-joint[1])*.48;let kx=0,kc=0;for(const p of pixels)if(Math.abs(p[1]-yKnee)<=2){kx+=p[0];kc++}return [joint,kc?[kx/kc,yKnee]:lerp(joint,ankle,.48),ankle]}
    const leftArm=arm(-1),rightArm=arm(1),leftLeg=leg(-1),rightLeg=leg(1);
    const foot=[(leftLeg[2][0]+rightLeg[2][0])/2,(leftLeg[2][1]+rightLeg[2][1])/2];
    const chest=[torsoMid+(hipCx-headCx)*-.28,shoulderY+(hipY-shoulderY)*.38];
    const gesture=chaikin([[headCx,headTop-H*.035],[headCx,headCy],[(shL[0]+shR[0])/2,shoulderY],chest,[hipCx,hipY],foot,[foot[0],y1+H*.03]]);
    const lines=[];
    const add=(pts,kind,color,width,copy)=>{const parts=copy?twin(pts,Math.max(1.1,H*.012)): [pts];for(const part of parts)lines.push({pts:part,kind,color,width})};
    add(gesture,'gesture',GESTURE,1.05,true);
    add([[headCx,headCy-ry],[headCx,headCy+ry*.9]],'construct',BUILD,.7,false);
    add([[headCx-rx*.72,headCy-ry*.12],[headCx+rx*.72,headCy-ry*.12]],'construct',BUILD,.62,false);
    add(ellipse(headCx,headCy,rx*1.08,ry*1.08,26),'construct',BUILD,.78,true);
    add([ [shL[0]-torsoW*.12,shL[1]],[shR[0]+torsoW*.12,shR[1]] ],'construct',BUILD,.8,true);
    add([[(shL[0]+shR[0])/2,shoulderY],[hipCx,hipY]],'construct',BUILD,.72,true);
    add([[hipL[0]-hipCore*.1,hipY],[hipR[0]+hipCore*.1,hipY]],'construct',BUILD,.76,true);
    add(ellipse(torsoMid,shoulderY+(hipY-shoulderY)*.34,torsoW*.5,(hipY-shoulderY)*.24,20),'mass',MASS,.62,false);
    add(ellipse(hipCx,hipY,Math.max(hipCore,torsoW)*.48,Math.max(4,(hipY-shoulderY)*.13),18),'mass',MASS,.62,false);
    add([shL,hipL],'construct',BUILD,.58,false);
    add([shR,hipR],'construct',BUILD,.58,false);
    add(leftArm,'construct',BUILD,.7,false);
    add(rightArm,'construct',BUILD,.7,false);
    add(leftLeg,'construct',BUILD,.7,false);
    add(rightLeg,'construct',BUILD,.7,false);
    const joints=[shL,shR,hipL,hipR,leftArm[1],leftArm[2],rightArm[1],rightArm[2],leftLeg[1],leftLeg[2],rightLeg[1],rightLeg[2]];
    const jr=Math.max(1.5,H*.016);
    for(const j of joints)lines.push({pts:ellipse(j[0],j[1],jr,jr,8),kind:'joint',color:BUILD,width:.5});
    return {pixels:comp.size,lines};
  }

  function massPlan(comp,w){
    const bw=comp.maxX-comp.minX+1,bh=comp.maxY-comp.minY+1;if(bw<6||bh<6)return [];
    let sx=0,sy=0,sxx=0,syy=0,sxy=0;for(const i of comp.pixels){const x=i%w,y=(i/w)|0;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y}const n=comp.pixels.length,mx=sx/n,my=sy/n;const cxx=sxx/n-mx*mx,cyy=syy/n-my*my,cxy=sxy/n-mx*my;const angle=Math.atan2(2*cxy,cxx-cyy)/2;const dx=Math.cos(angle),dy=Math.sin(angle);let minP=Infinity,maxP=-Infinity,minQ=Infinity,maxQ=-Infinity;for(const i of comp.pixels){const x=i%w-mx,y=((i/w)|0)-my;const p=x*dx+y*dy,q=-x*dy+y*dx;if(p<minP)minP=p;if(p>maxP)maxP=p;if(q<minQ)minQ=q;if(q>maxQ)maxQ=q}const pad=Math.max(bw,bh)*.08;const majorA=[mx+(minP-pad)*dx,my+(minP-pad)*dy],majorB=[mx+(maxP+pad)*dx,my+(maxP+pad)*dy];const minorA=[mx+minQ*-dy*.85,my+minQ*dx*.85],minorB=[mx+maxQ*-dy*.85,my+maxQ*dx*.85];const lines=[];const add=(pts,kind,color,width)=>lines.push({pts,kind,color,width});
    add(chaikin([majorA,lerp(majorA,majorB,.5),majorB]),'gesture',GESTURE,.9);
    add([minorA,minorB],'construct',BUILD,.55);
    const tall=bh>bw*1.25,wide=bw>bh*1.25;
    if(tall||wide){const bands=3;for(let b=0;b<bands;b++){const t0=b/bands,t1=(b+1)/bands;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,count=0;for(const i of comp.pixels){const x=i%w,y=(i/w)|0;const along=tall?(y-comp.minY)/bh:(x-comp.minX)/bw;if(along<t0||along>=t1&&b<bands-1)continue;count++;if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}if(count<12)continue;add(ellipse((x0+x1)/2,(y0+y1)/2,(x1-x0)*.56,(y1-y0)*.56,18),'mass',MASS,.58)}}
    else add(ellipse(mx,my,bw*.56,bh*.56,22),'mass',MASS,.62);
    add([[comp.minX,comp.minY],[comp.maxX,comp.minY],[comp.maxX,comp.maxY],[comp.minX,comp.maxY],[comp.minX,comp.minY]],'construct',BUILD,.4);
    return lines;
  }

  function toView(lines,w){const strokes=[];for(const line of lines){const pts=dedupe(line.pts.map(p=>[p[0]/w*100,p[1]/w*100]));if(pts.length<2)continue;if(line.kind!=='joint'&&len(pts)<.8)continue;strokes.push({pts,kind:line.kind,color:line.color,width:line.width})}return strokes.slice(0,200)}

  function build(data,width,height){
    if(!width||!height||!data||data.length<width*height*4)return {figure:false,share:.3,strokes:[]};
    const src=downsample(data,width,height,150);const mask=massMask(src.data,src.w,src.h);const comps=components(mask,src.w,src.h);
    const figures=[],others=[];
    for(const comp of comps){const fit=fitFigure(comp,src.w,src.h);if(fit)figures.push(fit);else others.push(comp)}
    figures.sort((a,b)=>b.pixels-a.pixels);
    const lines=[];let figure=false;
    for(const fit of figures.slice(0,2)){figure=true;lines.push(...fit.lines)}
    const figureFloor=figures.length?figures[0].pixels*.2:0;
    for(const comp of others){if(figure&&comp.size<figureFloor&&comp.size<src.w*src.h*.03)continue;lines.push(...massPlan(comp,src.w))}
    const strokes=toView(lines,src.w);
    return {figure,share:figure?.12:.08,strokes};
  }

  function croquiOf(comp,src){
    const fit=fitFigure(comp,src.w,src.h);
    const strokes=toView(fit?fit.lines:massPlan(comp,src.w),src.w);
    return {figure:!!fit,share:fit?.12:.08,strokes};
  }
  function packLayers(src,comps){
    return comps.map(comp=>{
      const croqui=croquiOf(comp,src),raw=new Uint8Array(src.w*src.h);
      for(const i of comp.pixels)raw[i]=1;
      return {comp,croqui,mask:dilate(raw,src.w,src.h,3)};
    });
  }
  // Break thin joins so a person can be drawn apart from text and props, then keep the cut that finds more bodies.
  function segment(data,width,height){
    const empty={figure:false,share:.08,strokes:[],layers:[]};
    if(!width||!height||!data||data.length<width*height*4)return empty;
    const src=downsample(data,width,height,200),mask=massMask(src.data,src.w,src.h);
    const plain=packLayers(src,components(mask,src.w,src.h,8,0.0035));
    const seeds=components(erode(mask,src.w,src.h,2),src.w,src.h,8,0.002);
    const grown=seeds.length>1?packLayers(src,regrow(mask,seeds,src.w,src.h)):[];
    const figures=list=>list.reduce((n,item)=>n+(item.croqui.figure?1:0),0);
    const picked=grown.length&&(figures(grown)>figures(plain)||(figures(grown)===figures(plain)&&grown.length>plain.length))?grown:plain;
    const layers=picked.map(item=>({figure:!!item.croqui.figure,share:item.croqui.share,strokes:item.croqui.strokes,mask:item.mask,maskW:src.w,maskH:src.h,minX:item.comp.minX,minY:item.comp.minY,maxX:item.comp.maxX,maxY:item.comp.maxY,size:item.comp.size}));
    layers.sort((a,b)=>a.minY-b.minY||a.minX-b.minX);
    const merged=[];let figure=false;
    for(const layer of [...layers].sort((a,b)=>(b.figure-a.figure)||b.size-a.size)){if(layer.figure)figure=true;for(const stroke of layer.strokes){if(merged.length>=200)break;merged.push(stroke)}}
    return {figure,share:figure?.12:.08,strokes:merged,layers};
  }

  const api={build,segment};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CroquiEngine=api;
})(typeof self!=='undefined'?self:globalThis);
