import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(process.argv[2] || 'vendor/ffmpeg');
const entry=(relative)=>({path:relative,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')});
const sources=['source/ffmpeg-6.1.6.tar.xz','source/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz'].map(entry);
assert.equal(sources[0].sha256,'d4fcb164028dd3beee5d92c0ac72e46aac6973c75ea12dc14de07bf8f407370a');
assert.equal(sources[1].sha256,'cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9');
const manifest={
  schemaVersion:1,
  version:'6.1.6-swoop-x264',
  platform:'win32',
  arch:'x64',
  license:'GPL-3.0-or-later',
  binary:entry('win32-x64/ffmpeg.exe'),
  sources,
  recipe:entry('build.sh'),
  licenseFiles:fs.readdirSync(path.join(root,'licenses')).sort().map(name=>entry(`licenses/${name}`)),
  metadataFiles:fs.readdirSync(path.join(root,'metadata')).sort().map(name=>entry(`metadata/${name}`)),
  additionalSourceFiles:['source/ffmpeg-6.1.6.tar.xz.asc','source/ffmpeg-release-key.asc'].map(entry),
  notice:entry('SOURCE.md'),
  ffmpeg:{version:'6.1.6',source:'https://ffmpeg.org/releases/ffmpeg-6.1.6.tar.xz',releaseKeyFingerprint:'FCF986EA15E6E293A5644F10B4322F04D67658D8',modified:false},
  externalLibraries:[{name:'x264',revision:'b35605ace3ddf7c1a5d67a2eb553f034aef41d55',source:'https://code.videolan.org/videolan/x264',modified:false}],
  compiler:{name:'MSYS2 UCRT64 GCC',version:'16.2.0-6',runtime:'static libgcc with GCC Runtime Library Exception 3.1; MinGW-w64 CRT'},
  reproducesByteIdentically:false,
};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({root,binary:manifest.binary,sources:manifest.sources},null,2));
