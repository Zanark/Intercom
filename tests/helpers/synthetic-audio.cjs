function syntheticTone() {
  const tone = Buffer.alloc(32044);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(16000, 24); tone.writeUInt32LE(32000, 28);
  tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34); tone.write('data', 36);
  tone.writeUInt32LE(32000, 40);
  for (let sample = 0; sample < 16000; sample++) tone.writeInt16LE(Math.round(Math.sin(sample * 2 * Math.PI * 440 / 16000) * 8000), 44 + sample * 2);
  return tone;
}

module.exports = { syntheticTone };
