// AudioWorklet processor: captures PCM16 mono at 24kHz.
// Posts Int16Array buffers to main thread every ~100ms (2400 samples).

class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(2400);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset >= 2400) {
        const int16 = new Int16Array(2400);
        for (let j = 0; j < 2400; j++) {
          int16[j] = Math.max(-32768, Math.min(32767, Math.round(this._buffer[j] * 32767)));
        }
        this.port.postMessage({ pcm16: int16 }, [int16.buffer]);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm16-processor", PCM16Processor);
