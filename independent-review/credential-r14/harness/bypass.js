'use strict';

/**
 * Single-boundary probes. Each vector runs in its own process.
 * A probe is a bypass when a TCP accept or UDP packet lands on 127.0.0.1
 * without guardedSend, or when a spawned child opens that socket.
 */

const fs = require('fs');
const net = require('net');
const dgram = require('dgram');
const path = require('path');
const { spawn } = require('child_process');

const PRELOAD = process.env.PRELOAD || '/tmp/cg-r14/luna-current/01_runtime/credentialGuardR14-preload.js';
const OUT = process.env.BYPASS_OUT || '/tmp/cg-r14-bypass.json';

const VECTORS = [
  ['BYP01', 'node:http', 'http.request'],
  ['BYP02', 'node:https', 'https.request'],
  ['BYP03', 'node:net', 'net.connect'],
  ['BYP04', 'node:tls', 'tls.connect'],
  ['BYP05', 'node:dgram', 'dgram.send'],
  ['BYP06', 'node:http2', 'http2.connect'],
  ['BYP07', 'fetch', 'fetch'],
  ['BYP08', 'undici', 'undici.request'],
  ['BYP09', 'child_process.exec', 'child.exec'],
  ['BYP10', 'child_process.spawn', 'child.spawn'],
  ['BYP11', 'child_process.execFile', 'child.execFile'],
  ['BYP12', 'child_process.fork', 'child.fork'],
  ['BYP13', 'worker_threads', 'worker.default'],
  ['BYP14', 'process.binding', 'binding.tcp'],
  ['BYP15', 'process.getBuiltinModule', 'getBuiltin.http'],
  ['BYP16', 'require.cache', 'cache.rerequire'],
  ['BYP17', 'preload_prior_module', 'captured.before'],
  ['BYP18', 'dynamic_import', 'import.http'],
  ['BYP19', 'vm_runInNewContext', 'vm.context'],
  ['BYP20', 'vm_compileFunction', 'vm.compile'],
  ['BYP21', 'http.get', 'http.get'],
  ['BYP22', 'https.get', 'https.get'],
  ['BYP23', 'net.createConnection', 'net.createConnection'],
  ['BYP24', 'module_load', 'module.load'],
  ['BYP13b', 'worker_threads', 'worker.noexecargv'],
];

function probeSource(name, port, udpPort) {
  const childConnect = `require(${JSON.stringify(process.execPath)})`;
  const scripts = {
    'http.request': `require('node:http').request({hostname:'127.0.0.1',port:${port},path:'/p',method:'GET'}).end()`,
    'https.request': `require('node:https').request({hostname:'127.0.0.1',port:${port},path:'/p',method:'GET',rejectUnauthorized:false}).end()`,
    'net.connect': `require('node:net').connect(${port},'127.0.0.1')`,
    'tls.connect': `require('node:tls').connect({host:'127.0.0.1',port:${port},rejectUnauthorized:false})`,
    'dgram.send': `const s=require('node:dgram').createSocket('udp4'); s.send(Buffer.from('x'),${udpPort},'127.0.0.1',()=>{});`,
    'http2.connect': `try{require('node:http2').connect('http://127.0.0.1:${port}')}catch(e){}`,
    'fetch': `fetch('http://127.0.0.1:${port}/p').catch(()=>{})`,
    'undici.request': `const u=require('undici'); if(u.request) u.request('http://127.0.0.1:${port}/p').catch(()=>{})`,
    'child.exec': `require('node:child_process').exec(${JSON.stringify(process.execPath + ' -e ' + JSON.stringify("require('net').connect(" + port + ",'127.0.0.1')"))})`,
    'child.spawn': `require('node:child_process').spawn(${JSON.stringify(process.execPath)},['-e',${JSON.stringify("require('net').connect(" + port + ",'127.0.0.1')")}])`,
    'child.execFile': `require('node:child_process').execFile(${JSON.stringify(process.execPath)},['-e',${JSON.stringify("require('net').connect(" + port + ",'127.0.0.1')")}])`,
    'child.fork': `try{require('node:child_process').fork(${JSON.stringify(path.join(__dirname, 'bypass-fork-child.js'))},[],{env:Object.assign({},process.env,{BYPASS_PORT:String(${port})})})}catch(e){}`,
    'worker.default': `const {Worker}=require('node:worker_threads'); new Worker(${JSON.stringify('require("net").connect(' + port + ',"127.0.0.1")')},{eval:true})`,
    'worker.noexecargv': `const {Worker}=require('node:worker_threads'); new Worker(${JSON.stringify('require("net").connect(' + port + ',"127.0.0.1")')},{eval:true,execArgv:[]})`,
    'binding.tcp': `const b=process.binding('tcp_wrap'); if(b&&b.TCP){const t=new b.TCP(0); if(t.connect) t.connect('127.0.0.1',${port});}`,
    'getBuiltin.http': `process.getBuiltinModule('http').request({hostname:'127.0.0.1',port:${port}}).end()`,
    'cache.rerequire': `const id=require.resolve('http'); delete require.cache[id]; require('http').request({hostname:'127.0.0.1',port:${port}}).end()`,
    'captured.before': 'CAPTURED',
    'import.http': `import('node:http').then(m=>m.request({hostname:'127.0.0.1',port:${port}}).end()).catch(()=>{})`,
    'vm.context': `const vm=require('node:vm'); const net=require('node:net'); vm.runInNewContext('net.connect(port,"127.0.0.1")',{net:net,port:${port}})`,
    'vm.compile': `const vm=require('node:vm'); vm.compileFunction('return require("net").connect(port,"127.0.0.1")',['require','port'])(require,${port})`,
    'http.get': `require('http').get({hostname:'127.0.0.1',port:${port}},()=>{})`,
    'https.get': `require('https').get({hostname:'127.0.0.1',port:${port},rejectUnauthorized:false},()=>{})`,
    'net.createConnection': `require('net').createConnection({host:'127.0.0.1',port:${port}})`,
    'module.load': `const Module=require('module'); const http=Module.createRequire(${JSON.stringify('/tmp/cg-r14/luna-current/01_runtime/package.json')})('http'); http.request({hostname:'127.0.0.1',port:${port}}).end()`,
  };
  return scripts[name];
}

function runChild(code, extraEnv, usePreload, captureBefore) {
  return new Promise((resolve) => {
    const args = captureBefore ? ['-e', code] : (usePreload ? ['--require', PRELOAD, '-e', code] : ['-e', code]);
    const child = spawn(process.execPath, args, {
      env: Object.assign({}, extraEnv, { PRELOAD }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2500);
    child.on('close', (status) => {
      clearTimeout(timer);
      const unguarded = /UNGUARDED_EGRESS|UNGUARDED_HTTP|UNAUTHORIZED_WRITE/.test(stderr);
      resolve({ status, unguarded, stderr: stderr.slice(0, 400) });
    });
  });
}

async function main() {
  const tcpHits = [];
  const udpHits = [];
  const tcp = net.createServer((sock) => {
    tcpHits.push(Date.now());
    sock.destroy();
  });
  await new Promise((resolve) => tcp.listen(0, '127.0.0.1', resolve));
  const port = tcp.address().port;
  const udp = dgram.createSocket('udp4');
  await new Promise((resolve) => udp.bind(0, '127.0.0.1', resolve));
  const udpPort = udp.address().port;
  udp.on('message', () => udpHits.push(Date.now()));

  fs.writeFileSync(path.join(__dirname, 'bypass-fork-child.js'), `require('net').connect(Number(process.env.BYPASS_PORT),'127.0.0.1');\n`);

  const results = [];
  for (const [id, vector, scriptName] of VECTORS) {
    const beforeTcp = tcpHits.length;
    const beforeUdp = udpHits.length;
    let info;
    if (scriptName === 'captured.before') {
      const code = `
        const http = require('http');
        const net = require('net');
        const tls = require('tls');
        const cp = require('child_process');
        const captured = { request: http.request, get: http.get, connect: net.connect, tls: tls.connect, spawn: cp.spawn };
        require(${JSON.stringify(PRELOAD)});
        try { captured.request({hostname:'127.0.0.1',port:${port}}).end(); } catch (e) {}
        try { captured.connect(${port}, '127.0.0.1'); } catch (e) {}
        try { captured.spawn(${JSON.stringify(process.execPath)}, ['-e', ${JSON.stringify("require('net').connect(" + port + ",'127.0.0.1')")}]); } catch (e) {}
      `;
      info = await runChild(code, { BYPASS_PORT: String(port) }, false, true);
    } else {
      const src = probeSource(scriptName, port, udpPort);
      const code = `try { ${src} } catch (e) { console.error(e && e.code || e && e.message || e); } setTimeout(()=>{}, 400);`;
      info = await runChild(code, { BYPASS_PORT: String(port) }, true, false);
    }
    await new Promise((r) => setTimeout(r, 350));
    const tcpDelta = tcpHits.length - beforeTcp;
    const udpDelta = udpHits.length - beforeUdp;
    const reached = tcpDelta > 0 || udpDelta > 0;
    results.push({
      id,
      vector,
      script: scriptName,
      reached_network: reached,
      tcp: tcpDelta,
      udp: udpDelta,
      threw_unguarded: info.unguarded && !reached,
      bypass: reached,
    });
    fs.writeSync(2, `BYPASS ${id} ${vector} reached=${reached} tcp=${tcpDelta} udp=${udpDelta}\n`);
  }
  tcp.close();
  udp.close();
  const bypasses = results.filter((r) => r.bypass).length;
  fs.writeFileSync(OUT, JSON.stringify({ bypasses, results }, null, 2));
  fs.writeSync(2, `BYPASS_TOTAL ${bypasses}\n`);
}

main().catch((e) => {
  fs.writeSync(2, 'BYPASS_FAIL ' + (e && e.message) + '\n');
  process.exit(1);
});
