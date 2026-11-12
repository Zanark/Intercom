const fs = require('node:fs/promises');
const path = require('node:path');
const { WhisperRecognizer } = require('../desktop/services/recognition.cjs');

module.exports = async ({ packager }) => {
  const root = path.join(packager.projectDir, '.local', 'speech-qualification', 'vulkan-engine');
  await new WhisperRecognizer(root, 'vulkan').verify({ cancelled: false });
  for (const name of ['whisper-cpp.txt', 'whisper-model.txt', 'miniaudio.txt']) {
    const notice = await fs.readFile(path.join(packager.projectDir, 'desktop', 'licenses', name), 'utf8');
    if (!notice.includes('Permission is hereby granted') || !notice.includes('THE SOFTWARE IS PROVIDED "AS IS"')) {
      throw new Error(`The bundled speech license is incomplete: ${name}`);
    }
  }
  console.log('Verified pinned local speech model, private-pipe warm helper, Vulkan runtime and license notices.');
};
