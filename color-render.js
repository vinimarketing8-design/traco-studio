'use strict';
const colorPaintCache=new WeakMap();
function validateColorElement(e,base,paths){
  if(!/^data:image\/(png|jpeg|webp);base64,/.test(e.src)||e.src.length>18000000)throw Error('Imagem colorida inválida');
  const p=e.paint;if(!p||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<3||p.height<3||p.width>1024||p.height>1024||!Array.isArray(p.runs)||!p.runs.length||p.runs.length>250000)throw Error('Pintura inválida');
  const palette=Array.isArray(p.palette)&&p.palette.length<=14?p.palette.map(rgb=>{if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('Paleta inválida');return rgb.slice()}):[];
  let pixels=0;const runs=p.runs.map(r=>{if(!Array.isArray(r)||(r.length!==4&&r.length!==5)||r.some(n=>!Number.isInteger(n))||r[0]<0||r[1]<0||r[1]>=p.height||r[2]<1||r[0]+r[2]>p.width||(r[3]!==0&&r[3]!==1)||(r.length===5&&(r[4]<0||r[4]>=palette.length)))throw Error('Pincelada inválida');pixels+=r[2];return r.slice()});
  return {...base,paths,src:e.src,stroke:clamp(+e.stroke,.1,8),drawShare:clamp(+e.drawShare,.2,.9),paint:{width:p.width,height:p.height,runs,pixels,regions:clamp(+p.regions,1,301),palette,clipped:!!p.clipped}};
}
function drawColored(c,e,p){
  const split=e.paths.length?e.drawShare:0;
  if(p<split)return drawImportedVector(c,e,p/split);
  const q=Math.max(0,Math.min(1,(p-split)/(1-split))),img=getImage(e.src);
  if(!img.complete||!img.naturalWidth)return drawImportedVector(c,e,1);
  if(q>=1&&!e.paint.clipped){c.drawImage(img,e.x,e.y,e.w,e.h);return null}
  let cached=colorPaintCache.get(e.paint);
  const key=e.stroke+'|'+e.color;
  if(!cached||cached.key!==key||cached.src!==e.src||cached.paths!==e.paths){
    const mask=document.createElement('canvas');mask.width=e.paint.width;mask.height=e.paint.height;
    const output=document.createElement('canvas');output.width=img.naturalWidth;output.height=img.naturalHeight;
    const ink=document.createElement('canvas');ink.width=output.width;ink.height=output.height;
    const ic=ink.getContext('2d');drawImportedVector(ic,{...e,x:0,y:0,w:ink.width,h:ink.height},1);ic.globalCompositeOperation='destination-in';ic.drawImage(img,0,0);ic.globalCompositeOperation='source-over';
    const layer=document.createElement('canvas');layer.width=output.width;layer.height=output.height;const colorSample=document.createElement('canvas');colorSample.width=colorSample.height=1;cached={key,src:e.src,paths:e.paths,mask,output,ink,layer,colorSample,index:0,done:0,q:-1,point:null};colorPaintCache.set(e.paint,cached);
  }
  const m=cached.mask.getContext('2d'),o=cached.output.getContext('2d'),pw=e.paint.width,ph=e.paint.height;
  if(q<cached.q){m.clearRect(0,0,pw,ph);cached.index=0;cached.done=0}
  if(q!==cached.q){
    const target=e.paint.pixels*q;m.fillStyle='#fff';let tip=null;
    while(cached.index<e.paint.runs.length){const [x,y,len,reverse,colorIndex]=e.paint.runs[cached.index];const count=Math.min(len,Math.max(0,target-cached.done));
      if(count<=0)break;m.fillRect(reverse?x+len-count:x,y,count,1);tip={x:reverse?x+len-count:x+count,y:y+.5,colorIndex};
      if(count<len)break;cached.done+=len;cached.index++;
    }
    o.clearRect(0,0,cached.output.width,cached.output.height);o.globalCompositeOperation='source-over';o.drawImage(img,0,0);o.globalCompositeOperation='destination-in';o.drawImage(cached.mask,0,0,cached.output.width,cached.output.height);o.globalCompositeOperation='source-over';
    cached.q=q;if(tip){const sx=Math.max(0,Math.min(img.naturalWidth-1,Math.floor(tip.x/pw*img.naturalWidth))),sy=Math.max(0,Math.min(img.naturalHeight-1,Math.floor(tip.y/ph*img.naturalHeight))),sc=cached.colorSample.getContext('2d',{willReadFrequently:true});sc.clearRect(0,0,1,1);sc.drawImage(img,sx,sy,1,1,0,0,1,1);const px=sc.getImageData(0,0,1,1).data,paletteColor=Number.isInteger(tip.colorIndex)&&e.paint.palette?.[tip.colorIndex];cached.point={...tip,color:paletteColor?`rgb(${paletteColor[0]} ${paletteColor[1]} ${paletteColor[2]})`:`rgb(${px[0]} ${px[1]} ${px[2]})`}}else cached.point=null;
  }
  // Remove the guide ink only where color has already been painted.
  c.save();const layer=cached.layer;const lc=layer.getContext('2d');lc.clearRect(0,0,layer.width,layer.height);lc.drawImage(cached.ink,0,0);lc.globalCompositeOperation='destination-out';lc.drawImage(cached.mask,0,0,layer.width,layer.height);lc.globalCompositeOperation='source-over';lc.drawImage(cached.output,0,0);c.drawImage(layer,e.x,e.y,e.w,e.h);c.restore();
  return cached.point?{x:e.x+cached.point.x/pw*e.w,y:e.y+cached.point.y/ph*e.h,color:cached.point.color,tool:'paint'}:null;
}
