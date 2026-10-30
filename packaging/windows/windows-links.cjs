// Next standalone tracing requests directory symlinks. Windows junctions work
// without Developer Mode; copied distribution files contain no junctions.
if (process.platform === 'win32') {
  const fs = require('node:fs');
  const path = require('node:path');
  const original = fs.promises.symlink.bind(fs.promises);
  fs.promises.symlink = async (target, destination, type) => {
    const source = path.resolve(path.dirname(destination), target);
    const stat = await fs.promises.stat(source);
    if (stat.isDirectory()) return original(source, destination, 'junction');
    return fs.promises.copyFile(source, destination);
  };
}
