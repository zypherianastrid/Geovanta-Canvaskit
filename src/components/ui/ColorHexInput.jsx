/**
 * @file src/components/ui/ColorHexInput.jsx
 * @description Komponen kotak teks kode warna CSS/Hex tervalidasi (ColorText)
 */
import React from 'react';
import { validColor } from '../../utils/colorParserAndFormatter.jsx';
import { CustomTextBox } from './CustomTextBox.jsx';

const ColorText = ({
  value,
  on,
  L
}) => {
  const commit = raw => {
    let s = String(raw || '').trim();
    if (/^[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(s)) s = '#' + s;
    if (s && validColor(s) && s !== value) on(s);
  };
  return <div className="fld hexf" style={{
    minWidth: 0
  }} data-tip="veColorText"><CustomTextBox value={value} ariaLabel={L ? L.cpCssColor : 'Warna CSS'} onCommit={commit} /></div>;
};

/* Grup 1: Alat Node & Handle — Set Ikon Geometris Terpadu (24x24, radius & stroke selaras) */

export { ColorText };
export default ColorText;
