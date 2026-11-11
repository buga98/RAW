/* RAW website local preview. Strictly localhost; no Firebase or user files. */
import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {resolve,dirname,join,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
const dir=resolve(dirname(fileURLToPath(import.meta.url)),"..","site");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
 ".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",
 ".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=="GET"&&req.method!=="HEAD"){
   res.writeHead(405,{"Allow":"GET, HEAD"});return res.end();
  }
  const url=new URL(req.url||"/","http://127.0.0.1");
  const decoded=decodeURIComponent(url.pathname);
  if(decoded.includes("\0")||decoded.includes("\\")||decoded.includes("..")){
   res.writeHead(400);return res.end();
  }
  const full=resolve(dir,"."+decoded);
  if(!(full===dir||full.startsWith(dir+sep))){
   res.writeHead(403);return res.end();
  }
  let file=full===dir?join(dir,"index.html"):full;
  const info=await stat(file);
  if(info.isDirectory())file=join(file,"index.html");
  const bytes=await readFile(file);
  res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream",
   "Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"});
  res.end(req.method==="HEAD"?undefined:bytes);
 }catch{res.writeHead(404);res.end("Not found");}
});
server.listen(4178,"127.0.0.1",()=>{
 console.log("RAW website preview: http://127.0.0.1:4178/");
 console.log("Local only. Press Ctrl+C to stop. Download buttons stay disabled.");
});
