import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ROOT } from './collect.mjs';
const base=path.join(ROOT,'docs');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(base,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));if(!file.startsWith(base+path.sep))throw new Error('path');const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}}).listen(4317,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4317'));
