/**
 * @file src/utils/presenceAndFilePicker.jsx
 * @description Hook animasi transisi komponen & dialog pemilih file
 */
import React, { useState, useEffect } from 'react';

const usePresence = (open, ms = 160) => {
  const [m, setM] = useState(open),
    [lv, setLv] = useState(false);
  useEffect(() => {
    if (open) {
      setM(true);
      setLv(false);
      return;
    }
    if (!m) return;
    setLv(true);
    const t = setTimeout(() => {
      setM(false);
      setLv(false);
    }, ms);
    return () => clearTimeout(t);
  }, [open]);
  return [m, lv];
};
const pickFiles = async (accept, cb) => {
  if (window.showOpenFilePicker) {
    try {
      const hs = await window.showOpenFilePicker({
        multiple: true
      });
      const fs = await Promise.all(hs.map(h => h.getFile()));
      if (fs.length) cb(fs);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  window.dispatchEvent(new CustomEvent('svgpeak-open-import'));
};
const pickFile = (accept, cb) => pickFiles(accept, fs => {
  if (fs && fs[0]) cb(fs[0]);
});

export { usePresence, pickFiles, pickFile };
