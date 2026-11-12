/* RAW v5.45 site preview — LOCALHOST only; uses exact deploy-staged bytes. */
import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {resolve,dirname,join,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const dir=join(root,"artifacts","raw-v544-site-staging");
const mime={
 ".html":"text/html; charset=utf-8",
 ".css":"text/css; charset=utf-8",
 ".js":"text/javascript; charset=utf-8",
 ".json":"application/json; charset=utf-8",
 ".svg":"image/svg+xml",
 ".png":"image/png",
 ".txt":"text/plain; charset=utf-8",
 ".xml":"application/xml; charset=utf-8"
};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=="GET"&&req.method!=="HEAD"){
   res.writeHead(405,{"Allow":"GET, HEAD"});res.end();return;
  }
  const input=new URL(req.url||"/","http://127.0.0.1:4179");
  const pathname=decodeURIComponent(input.pathname);
  if(pathname.includes("\\")||pathname.includes("\0")||pathname.includes("..")){
   res.writeHead(400);res.end();return;
  }
  const full=resolve(dir,"."+pathname);
  if(!(full===dir||full.startsWith(dir+sep))){
   res.writeHead(403);res.end();return;
  }
  let file=full===dir?join(dir,"index.html"):full;
  const info=await stat(file);
  if(info.isDirectory())file=join(file,"index.html");
  const data=await readFile(file);
  res.writeHead(200,{
   "Content-Type":mime[extname(file)]||"application/octet-stream",
   "X-Content-Type-Options":"nosniff",
   "Cache-Control":"no-store"
  });
  res.end(req.method==="HEAD"?undefined:data);
 }catch{res.writeHead(404);res.end("Not Found");}
});
server.listen(4179,"127.0.0.1",()=>{
 console.log("[RAW v5.45] LOCAL WEBSITE PREVIEW: http://127.0.0.1:4179/");
 console.log("Staged files only; download links remain disabled without verified release metadata.");
});
