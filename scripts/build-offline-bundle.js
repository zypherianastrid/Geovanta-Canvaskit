/**
 * Offline bundler untuk Geovanta Windows 64-Bit Desktop App
 *
 * 1. Jika `esbuild` terpasang  -> kompilasi ulang src/main.jsx (semua .jsx) ke dist/assets/geovanta.bundle.js
 *    (pasang dengan: npm install --no-save esbuild)
 * 2. Jika `esbuild` tidak ada  -> pakai dist/assets/geovanta.bundle.js yang sudah jadi
 * 3. Selalu menyalin index.html + bundle ke folder terisolasi `web/` (dipakai Tauri sebagai frontendDist)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distBundle = path.join(root, 'dist/assets/geovanta.bundle.js');
const webDir = path.join(root, 'web');

function tryLoadEsbuild() {
  try { return require('esbuild'); } catch (e) { return null; }
}

(async () => {
  const esbuild = tryLoadEsbuild();
  if (esbuild) {
    console.log('[Geovanta Build] esbuild ditemukan, mengompilasi src/main.jsx ...');
    fs.mkdirSync(path.dirname(distBundle), { recursive: true });
    await esbuild.build({
      entryPoints: [path.join(root, 'src/main.jsx')],
      outfile: distBundle,
      bundle: true,
      minify: true,
      format: 'iife',
      loader: { '.jsx': 'jsx' },
      jsx: 'transform',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'warning',
    });
  } else {
    console.log('[Geovanta Build] esbuild tidak terpasang -> memakai dist/assets/geovanta.bundle.js yang sudah ada.');
    console.log('[Geovanta Build] (Edit src/*.jsx baru berlaku jika esbuild terpasang: npm install --no-save esbuild)');
  }

  if (!fs.existsSync(distBundle)) {
    throw new Error('Bundle tidak ditemukan: ' + distBundle);
  }

  // Folder terisolasi khusus untuk Tauri (tanpa node_modules / src-tauri)
  fs.rmSync(webDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(webDir, 'assets'), { recursive: true });
  fs.copyFileSync(distBundle, path.join(webDir, 'assets/geovanta.bundle.js'));
  const html = fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('./dist/assets/', './assets/');
  fs.writeFileSync(path.join(webDir, 'index.html'), html);

  const kb = (fs.statSync(distBundle).size / 1024).toFixed(1);
  console.log(`[Geovanta Build] Selesai: bundle ${kb} KB -> dist/ dan web/`);
})().catch((e) => {
  console.error('[Geovanta Build] GAGAL:', e.message || e);
  process.exit(1);
});
