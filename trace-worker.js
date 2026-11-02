importScripts('trace-core.js');
importScripts('color-core.js');
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:data.input.mode==='color'?ColorEngine.prepare(data.input):TraceEngine.trace(data.input)})}catch(e){self.postMessage({id:data.id,error:e.message})}};
