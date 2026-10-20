import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [binary, fixtureDirectory] = process.argv.slice(2);
assert(binary && fixtureDirectory, 'Usage: node release-encoder-verify.mjs <binary> <fixture-directory>');
const run = (args) => execFileSync(binary, args, {encoding:'utf8',windowsHide:true,timeout:45000,stdio:['ignore','pipe','pipe']});
const checks=[];
const version=run(['-hide_banner','-version']);
assert.match(version,/ffmpeg version 6\.1\.6/);
checks.push('FFmpeg 6.1.6 version and executable start');
const diagnostic=path.join(fixtureDirectory,'diagnostic-h264.mp4');
run(['-v','error','-nostdin','-y','-f','lavfi','-i','color=c=blue:s=64x64:r=12','-t','0.25','-c:v','libx264','-pix_fmt','yuv420p',diagnostic]);
run(['-v','error','-nostdin','-i',diagnostic,'-f','null','-']);
checks.push('Diagnostic lavfi source, H.264 MP4 encode and null decode');
const mp4=path.join(fixtureDirectory,'h264-aac.mp4');
run(['-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','0.5','-c:v','libx264','-c:a','aac',mp4]);
for(const input of ['vp8-opus.webm','vp9-opus.webm','h264-aac.mp4']) {
  assert(fs.existsSync(path.join(fixtureDirectory,input)),`Missing format fixture ${input}`);
  const output=path.join(fixtureDirectory,input.replace(/\.(webm|mp4)$/, '-export.mp4'));
  const progress=run(['-hide_banner','-nostdin','-v','error','-y','-i',path.join(fixtureDirectory,input),'-map','0:v:0','-map','0:a?','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-progress','pipe:1','-nostats',output]);
  assert.match(progress,/progress=end/);
  assert(fs.statSync(output).size>1000);
  run(['-v','error','-nostdin','-i',output,'-f','null','-']);
  const probe=run(['-hide_banner','-i',output,'-map','0:v','-map','0:a','-f','null','-']);
  checks.push(`${input} through exact Swoop MP4 command, audio/video mapping and full decode`);
}
const demo=path.resolve('public/demo/Swoop-Studio-Demo.mp4');
if(fs.existsSync(demo)) {
  run(['-v','error','-nostdin','-i',demo,'-f','null','-']);
  checks.push('Full included demo MP4 decode');
}
const result={passed:true,version:version.split(/\r?\n/)[0],binary:path.resolve(binary),sha256:crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),checks};
fs.writeFileSync(path.join(fixtureDirectory,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
