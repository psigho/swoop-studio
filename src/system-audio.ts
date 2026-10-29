import type { SwoopBridge } from "./bridge";

// Audio runs only into the recording mix, never the machine's speakers.
const processor = `
class SwoopOutput extends AudioWorkletProcessor {
  constructor() {
    super(); this.capacity=24000; this.left=new Float32Array(this.capacity); this.right=new Float32Array(this.capacity);
    this.read=0; this.size=0; this.started=false;
    this.port.onmessage=({data})=>{
      const pcm=new Float32Array(data);
      const frames=pcm.length/2;
      if(this.size+frames>this.capacity){ this.port.postMessage('overflow'); return; }
      for(let i=0;i<frames;i++){ const at=(this.read+this.size+i)%this.capacity; this.left[at]=pcm[i*2]; this.right[at]=pcm[i*2+1]; }
      this.size+=frames;
    };
  }
  process(_inputs,outputs){
    const channels=outputs[0];
    if(!this.started && this.size>=960) this.started=true;
    for(let i=0;i<channels[0].length;i++){
      if(this.started && this.size){ channels[0][i]=this.left[this.read]; channels[1][i]=this.right[this.read]; this.read=(this.read+1)%this.capacity; this.size--; }
      else { channels[0][i]=0; channels[1][i]=0; }
    }
    return true;
  }
}
registerProcessor('swoop-output',SwoopOutput);`;

export async function selectedSystemAudio(
  native: SwoopBridge,
  context: AudioContext,
  deviceId: string,
  onEnded: (message: string) => void,
) {
  const url = URL.createObjectURL(
    new Blob([processor], { type: "text/javascript" }),
  );
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(context, "swoop-output", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  let id: string | undefined,
    stopped = false;
  let early: { id: string; bytes?: Uint8Array; error?: string }[] = [];
  const consume = (packet: (typeof early)[number]) => {
    if (stopped || packet.id !== id) return;
    if (packet.error) {
      onEnded(packet.error);
      return;
    }
    if (packet.bytes) {
      const bytes = new Uint8Array(packet.bytes).buffer;
      node.port.postMessage(bytes, [bytes]);
      native.ackSystemAudio(packet.id);
    }
  };
  const unsubscribe = native.onSystemAudio((packet) => {
    if (!id) {
      if (early.length < 32) early.push(packet);
      return;
    }
    consume(packet);
  });
  node.port.onmessage = () =>
    onEnded(
      "The recorder could not keep up with system audio. The take has been stopped.",
    );
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    node.port.close();
    node.disconnect();
    if (id) await native.stopSystemAudio(id);
  };
  try {
    const info = await native.startSystemAudio(deviceId);
    id = info.id;
    if (info.sampleRate !== context.sampleRate)
      throw new Error("System audio mixer must run at 48 kHz.");
    early.forEach(consume);
    early = [];
    return { node, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
