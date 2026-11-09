/**
 * @file src/constants/tooltipsCatalog.jsx
 * @description Katalog lengkap teks tooltip Bahasa Indonesia
 */
/* ---------- Tooltip kustom (delegasi event pada atribut data-tip) ---------- */
const TIPS = {
  help: {
    k: '?',
    t: 'Pintasan keyboard',
    d: 'Menampilkan daftar semua pintasan keyboard.'
  },
  settings: {
    k: ',',
    t: 'Pengaturan',
    d: 'Tema, animasi, preferensi UI, dan opsi aplikasi.',
    w: 'Ubah tampilan atau perilaku aplikasi.'
  },
  setTheme: {
    t: 'Tema',
    d: 'Warna antarmuka: mengikuti sistem, terang, atau gelap.'
  },
  setMotion: {
    t: 'Animasi',
    d: 'Mengontrol animasi dan transisi UI.',
    w: 'Nonaktifkan jika mengalami lag atau lebih suka antarmuka tenang.'
  },
  setTips: {
    t: 'Tooltip',
    d: 'Menampilkan petunjuk saat mengarahkan kursor ke kontrol.',
    w: 'Nonaktifkan jika sudah mahir memakai aplikasi.'
  },
  setPersist: {
    t: 'Simpan preferensi',
    d: 'Menyimpan tema, animasi, dan preferensi UI di browser (localStorage).'
  },
  setReset: {
    t: 'Reset pengaturan',
    d: 'Mengembalikan semua preferensi aplikasi ke nilai bawaan.'
  },
  setAbout: {
    t: 'Tentang',
    d: 'Versi aplikasi dan informasi teknis.'
  },
  vePruneNodes: {
    t: 'Hapus Node Non-Sudut',
    d: 'Mendeteksi sudut tajam (belokan mendadak yang kontur aslinya menempel pada titik potong kedua sisi), mengunci node di sudut itu, lalu menghapus semua node di tengah/pinggir sisi di antara dua sudut selama penyimpangan terhadap kontur asli tidak melebihi toleransi. Sisi lengkung diganti 1 kurva Bézier bila masih sesuai. Node di batas bersama antar objek tidak disentuh.',
    w: 'Cocok untuk merapikan path dengan node berlebih, mis. huruf A dari 58 node menjadi tepat sebanyak sudutnya.'
  },
  vePruneTol: {
    t: 'Toleransi hapus node',
    d: 'Simpangan maksimum hasil terhadap kontur asli. Kecil = aman tapi node tersisa lebih banyak; besar = lebih agresif.',
    w: 'Mulai 0.75; naikkan bila node tengah masih tersisa.'
  },
  vePruneAng: {
    t: 'Sudut minimal',
    d: 'Belokan di bawah nilai ini tidak dianggap sudut sehingga nodenya boleh dihapus.',
    w: 'Turunkan bila sudut tumpul ikut hilang; naikkan bila node noise tersisa.'
  },
  veAutoRefine: {
    t: 'Auto Rapikan',
    d: 'Meluruskan segmen meleyot / rantai node bergelombang lalu membulatkan sudut patah-patah pada objek terpilih, dalam satu klik. Memakai Ambang penyimpangan di bawah. Batas bersama dengan objek lain dijaga agar tidak muncul celah.',
    w: 'Untuk merapikan sisi dan sudut objek terpilih sekaligus.'
  },
  closeDlg: {
    k: 'Esc',
    t: 'Tutup',
    d: 'Menutup panel ini.'
  },
  /* ---- Editor gradien ---- */
  veGradMode: {
    t: 'Mode Fill',
    d: 'Jenis isian objek: warna solid, gradien linear, gradien radial, atau tanpa isi.'
  },
  veGradSolid: {
    t: 'Solid',
    d: 'Mengisi objek dengan satu warna rata.'
  },
  veGradLinear: {
    t: 'Linear',
    d: 'Gradien lurus dari satu titik ke titik lain, dengan sudut yang bisa diatur.'
  },
  veGradRadial: {
    t: 'Radial',
    d: 'Gradien melingkar yang memancar dari pusat ke tepi.'
  },
  veGradNone: {
    t: 'Kosong',
    d: 'Objek tidak memiliki isian (hanya stroke).'
  },
  veGradBar: {
    t: 'Bilah gradien',
    d: 'Klik di bilah untuk menambah stop warna baru; seret stop untuk memindahkannya.'
  },
  veGradStop: {
    t: 'Stop warna',
    d: 'Klik untuk memilih stop, seret untuk memindahkan posisinya di sepanjang gradien.'
  },
  veGradMid: {
    t: 'Titik tengah (midpoint)',
    d: 'Mengatur di mana campuran dua stop berada di 50%. Seret untuk menggeser, klik dua kali untuk reset ke 50%.'
  },
  veGradStopColor: {
    t: 'Warna stop',
    d: 'Mengubah warna stop yang sedang dipilih.'
  },
  veGradDelStop: {
    t: 'Hapus stop',
    d: 'Menghapus stop yang sedang dipilih (gradien minimal punya 2 stop).'
  },
  veGradStopPos: {
    t: 'Posisi stop',
    d: 'Letak stop sepanjang gradien, 0% di awal sampai 100% di akhir.'
  },
  veGradStopOp: {
    t: 'Opacity stop',
    d: 'Transparansi warna pada stop ini; 0% bening, 100% pekat.'
  },
  veGradAngle: {
    t: 'Sudut gradien',
    d: 'Arah gradien linear dalam derajat (−180° sampai 180°).'
  },
  veGradAnglePreset: {
    t: 'Sudut cepat',
    d: 'Langsung mengatur sudut gradien ke nilai ini.'
  },
  veGradInterp: {
    t: 'Ruang interpolasi',
    d: 'Cara warna dicampur di antara stop. OKLab menghasilkan peralihan yang lebih halus dan alami; sRGB mengikuti perilaku standar SVG.'
  },
  veGradOk: {
    t: 'OKLab halus',
    d: 'Campuran warna di ruang OKLab: tidak ada pita keruh di tengah peralihan.'
  },
  veGradSrgb: {
    t: 'sRGB',
    d: 'Campuran warna sRGB standar, sesuai tampilan SVG di semua aplikasi.'
  },
  veGradSpread: {
    t: 'Metode spread',
    d: 'Perilaku gradien di luar titik awal dan akhirnya.'
  },
  veGradPad: {
    t: 'Pad',
    d: 'Warna stop pertama dan terakhir diperpanjang ke luar.'
  },
  veGradReflect: {
    t: 'Reflect',
    d: 'Gradien dipantulkan bolak-balik di luar batasnya.'
  },
  veGradRepeat: {
    t: 'Repeat',
    d: 'Gradien diulang dari awal di luar batasnya.'
  },
  veGradReverse: {
    t: 'Balik gradien',
    d: 'Membalik urutan semua stop (awal menjadi akhir).'
  },
  veGradDistribute: {
    t: 'Ratakan stop',
    d: 'Menyebar semua stop dengan jarak sama rata dari 0% sampai 100%.'
  },
  veGradRdp: {
    t: 'Sederhanakan stop (RDP)',
    d: 'Membuang stop yang berlebihan pada gradien memakai algoritma Ramer–Douglas–Peucker, tanpa banyak mengubah tampilan.'
  },
  /* ---- Pen, Auto Handle, layer ---- */
  vePenNoFill: {
    t: 'Tanpa isi',
    d: 'Path yang digambar hanya berupa garis (stroke), tanpa warna isian.'
  },
  vePenFill: {
    t: 'Dengan isi',
    d: 'Path yang digambar diberi warna isian.'
  },
  vePenFinish: {
    k: 'Enter',
    t: 'Selesai menggambar',
    d: 'Mengakhiri path yang sedang digambar.'
  },
  veAhAddSel: {
    t: 'Tambah handle ke terpilih',
    d: 'Menambahkan handle Bézier ke objek atau node terpilih tanpa mengubah bentuknya (handle ditempatkan di 1/3 dan 2/3 segmen).'
  },
  veAhAddAll: {
    t: 'Tambah handle ke semua',
    d: 'Menambahkan handle Bézier ke semua objek tanpa mengubah bentuknya.'
  },
  veAhDelSel: {
    t: 'Hapus handle terpilih',
    d: 'Menghapus handle pada objek terpilih sehingga segmennya menjadi garis lurus.'
  },
  veAhDelAll: {
    t: 'Hapus handle semua',
    d: 'Menghapus handle pada semua objek.'
  },
  veAhScopeSub: {
    t: 'Cakupan: subpath',
    d: 'Klik di kanvas hanya memengaruhi subpath yang diklik.'
  },
  veAhScopeObj: {
    t: 'Cakupan: seluruh objek',
    d: 'Klik di kanvas memengaruhi semua subpath dalam objek yang diklik.'
  },
  veClipFrames: {
    t: 'Clip Frame',
    d: 'Memotong tampilan objek yang melewati batas Frame, seperti Clip Content di Figma.'
  },
  veToolGroup: {
    t: 'Pilih alat dalam grup',
    d: 'Membuka daftar alat lain yang sekelompok dengan tombol ini.'
  },
  veSelColor: {
    t: 'Ganti warna',
    d: 'Mengubah warna ini pada semua objek yang memakainya sekaligus.'
  },
  veSelPick: {
    t: 'Pilih objek berwarna ini',
    d: 'Memilih hanya objek yang memakai warna ini, untuk mengatur radius atau stroke sekaligus.'
  },
  veSelect: {
    k: 'V',
    t: 'Pilih',
    d: 'Pilih objek atau node. Shift untuk multi-seleksi. Seret objek untuk memindahkan.'
  },
  veAddNode: {
    t: 'Tambah Node',
    d: 'Arahkan kursor ke garis objek mana pun, lalu klik untuk menambah node di titik itu. Seret setelah klik untuk langsung memindahkannya. Snap ke titik tengah segmen, garis grid, serta node dan tepi objek lain. Tahan Alt untuk menonaktifkan snap.',
    w: 'Saat butuh node tambahan di tempat yang presisi.'
  },
  veAddHandle: {
    t: 'Tambah Handle Bézier',
    d: 'Arahkan kursor ke sebuah node (muncul cincin dan pratinjau handle), lalu klik untuk menambahkan handle Bézier pada node itu. Handle dibuat mengikuti arah garis di sekitar node; seret setelah klik untuk langsung mengatur panjang dan arahnya. Node yang sudah punya handle lengkap tidak berubah.',
    w: 'Mengubah sudut lurus menjadi lengkung, atau menambah handle yang belum ada pada node di ujung path.'
  },
  vePen: {
    k: 'P',
    t: 'Pen Tool',
    d: 'Klik = node sudut (lurus). Klik-tahan-seret (> 4 px) = node halus dengan handle simetris. Alt saat menyeret = patahkan sudut (handle masuk dikunci). Shift = kunci sudut 45°. Klik node pertama untuk menutup path; Enter / Esc / klik ganda untuk mengakhiri; Backspace menghapus node terakhir. Snap multi-guide aktif.',
    w: 'Menggambar kurva Bézier presisi dari nol.'
  },
  veAutoHandle: {
    k: 'B',
    t: 'Auto Handle Bézier',
    d: 'Klik sebuah node (atau badan objek) untuk memberi SEMUA node pada subpath itu handle Bézier yang mulus (Centripetal Catmull-Rom, tanpa lipatan). Seret kanan/kiri setelah klik untuk mengatur ketegangan secara live.',
    w: 'Mengubah poligon bergerigi menjadi kurva mulus sekaligus.'
  },
  veAhTension: {
    t: 'Ketegangan (τ)',
    d: 'Panjang handle relatif terhadap jarak antar-node. 0 = sudut tajam, 0,33 = standar Hermite, 0,5 = sangat bulat.',
    up: 'Kurva lebih bulat dan menggelembung.',
    dn: 'Kurva lebih rapat mengikuti poligon.'
  },
  veAhAngle: {
    t: 'Lewati sudut lancip',
    d: 'Node yang sudut apitnya lebih kecil dari nilai ini tidak diubah, sehingga sudut tajam tetap tajam.',
    up: 'Lebih banyak sudut dipertahankan.',
    dn: 'Semua node dihaluskan.'
  },
  veNode: {
    k: 'A | N',
    t: 'Edit Node',
    d: 'Tampilkan dan edit node serta handle Bezier. Seret node atau handle untuk mengubah bentuk path.'
  },
  veHand: {
    k: 'H | Spasi',
    t: 'Geser',
    d: 'Seret canvas untuk menggeser tampilan. Tombol tengah mouse juga bisa digunakan di alat lain.'
  },
  veStraight: {
    t: 'Luruskan',
    d: 'Panel pelurusan garis: merapikan segmen yang hampir lurus pada path terpilih.',
    w: 'Untuk merapikan sisi logo atau bentuk geometris.'
  },
  veAlignSel: {
    t: 'Luruskan terpilih',
    d: 'Jajarkan node atau handle Bézier yang dipilih ke satu garis lurus. Hampir horizontal/vertikal akan di-snap ke sumbu, dan segmen di antara node terpilih menjadi garis lurus.',
    w: 'Garis bawah persegi yang meleyot: pilih dua node bawah (atau handle-nya), lalu klik.'
  },
  veCorner: {
    t: 'Smooth Corner',
    d: 'Fillet sirkular pada node sudut terpilih. Pilih node dulu, atur radius, lalu terapkan.'
  },
  veSnap: {
    t: 'Snap',
    d: 'Multi-snap ala Figma: klik panah kecil di sebelahnya untuk memilih fitur (Smart Guides kotak/pusat, Jarak Sama Rata, Artboard, Node & Handle, Sumbu X/Y node, Midpoint, Kontur, Siku 90°/perpanjangan, Grid, Piksel). Sumbu X dan Y menempel secara independen. Saat menyeret, node dan handle Bézier menempel ke node/handle objek lain (lingkaran merah), ke tepi/kontur objek lain (berlian hijau), lalu ke grid. Titik handle yang diseret juga menempel ke garis handle Bézier lain (berlian oranye). Toleransi 8 piksel layar. Tahan Alt untuk menonaktifkan sementara.'
  },
  veCornerMode: {
    t: 'Profil sudut',
    d: 'Circular = busur lingkaran presisi. Squircle = handle Bézier lebih panjang sehingga transisi lebih lembut. Bevel = sudut dipotong menjadi garis miring lurus (chamfer).'
  },
  veCornerSm: {
    t: 'Kehalusan',
    d: 'Panjang handle relatif terhadap jarak titik singgung (hanya mode Bézier halus).',
    up: 'Sudut makin penuh/melebar.',
    dn: 'Mendekati lengkung lingkaran.'
  },
  veGrid: {
    t: 'Grid',
    d: 'Menampilkan grid sebagai panduan dan target snap. Ukuran grid menyesuaikan zoom otomatis (kelipatan 10 unit) agar garis selalu terbaca, di zoom berapa pun.'
  },
  veMaxDev: {
    t: 'Ambang penyimpangan',
    d: 'Deviasi maksimum (unit) agar rantai node dianggap garis lurus.',
    up: 'Lebih agresif meluruskan; detail kecil ikut rata.',
    dn: 'Hanya segmen yang sangat lurus yang diubah.'
  },
  veAngTol: {
    t: 'Toleransi arah',
    d: 'Sudut maksimum antar segmen yang masih digabung saat pelurusan.',
    up: 'Lebih longgar menggabung belokan gradual.',
    dn: 'Sudut tajam tetap dipertahankan.'
  },
  veApplyStraight: {
    t: 'Terapkan pelurusan',
    d: 'Menyejajarkan node atau handle terpilih sesuai pengaturan di atas. Jika tidak ada node dipilih, meluruskan seluruh path dengan ambang di bawah.'
  },
  veCornerRadius: {
    t: 'Corner radius',
    d: 'Membulatkan semua sudut tajam pada objek terpilih dengan fillet sirkular. Geser untuk mengubah radius kapan saja; 0 mengembalikan sudut tajam. Hanya sudut di antara dua segmen lurus yang dibulatkan, dan radius dibatasi 45% panjang segmen.',
    up: 'Sudut makin membulat.',
    dn: 'Sudut makin tajam; 0 = tajam.'
  },
  veCornerR: {
    t: 'Radius corner',
    d: 'Radius fillet sirkular yang diterapkan pada node sudut.',
    up: 'Sudut lebih membulat.',
    dn: 'Fillet lebih kecil dan tajam.'
  },
  veApplyCorner: {
    t: 'Terapkan smooth corner',
    d: 'Mengganti node sudut terpilih dengan dua node smooth (fillet).'
  },
  veClose: {
    t: 'Tutup path',
    d: 'Menutup path terpilih (menambah segmen penutup ke titik awal).'
  },
  veOpen: {
    t: 'Buka path',
    d: 'Membuka path tertutup (menghapus penutup Z).'
  },
  veDelNode: {
    k: 'Delete',
    t: 'Hapus node',
    d: 'Menghapus node yang sedang dipilih dari path.'
  },
  veSharpen: {
    t: 'Lancipkan sudut',
    d: 'Meleburkan sudut yang tumpul/membulat (dua node berdekatan, mis. hasil impor atau fillet lama) menjadi satu sudut tajam di perpotongan garis singgungnya. Tanpa node terpilih: deteksi otomatis di seluruh objek terpilih. Dengan node terpilih: dua node bersebelahan dilebur; node tunggal dijadikan corner tanpa handle.'
  },
  veSmoothTb: {
    t: 'Haluskan node (Taubin)',
    d: 'Meratakan posisi node terpilih tanpa menyusutkan bentuk (filter Taubin λ|μ), lalu menghitung ulang handle Bézier yang mulus (G1).'
  },
  veTypeCorner: {
    t: 'Tipe Corner',
    d: 'Node sudut tajam; handle kiri dan kanan independen. Bila 2+ node dipilih dan hampir segaris, node ikut diluruskan; bila handle dipilih, handle diluruskan.'
  },
  veTypeSmooth: {
    t: 'Tipe Smooth',
    d: 'Handle berlawanan arah (G1); panjang handle bisa berbeda.'
  },
  veTypeSym: {
    t: 'Tipe Symmetric',
    d: 'Handle berlawanan arah dengan panjang sama (G1 + simetri).'
  },
  veMirror: {
    t: 'Mirroring Handle',
    d: 'Atur bagaimana handle Bézier berpasangan pada node/handle terpilih, seperti panel Mirroring di Figma. Pilih node (atau handle) lebih dulu. Tahan Alt saat menyeret handle untuk memutus mirroring sementara (node menjadi No mirroring).',
    w: 'Mode berlaku langsung saat menyeret handle, bukan hanya saat dipilih.'
  },
  veMirrorNone: {
    t: 'No mirroring',
    d: 'Kedua handle sepenuhnya independen: arah dan panjang masing-masing bebas. Menggeser satu handle tidak menggerakkan handle seberang.',
    w: 'Membuat sudut tajam atau kurva yang tidak simetris.'
  },
  veMirrorAngle: {
    t: 'Mirror angle',
    d: 'Kedua handle selalu segaris (berlawanan arah). Memutar satu handle ikut memutar handle seberang, tetapi panjang masing-masing tetap berbeda dan bebas.',
    w: 'Kurva mulus (G1) dengan panjang handle yang tidak sama.'
  },
  veMirrorAL: {
    t: 'Mirror angle and length',
    d: 'Kedua handle segaris DAN sama panjang. Menggeser satu handle memantulkan posisinya ke handle seberang secara penuh (simetris terhadap node).',
    w: 'Kurva simetris sempurna di sekitar node.'
  },
  veMirrorCurve: {
    t: 'No mirroring (Geser Melengkung)',
    d: 'Kedua handle bebas & independen (tidak saling memantul), tetapi otomatis memunculkan handle Bézier dan melengkungkan segmen secara dinamis saat salah satu handle digeser.',
    w: 'Saat ingin menggeser 1 handle secara independen menjadi kurva melengkung mulus.'
  },
  veCurveDrag: {
    t: 'Mode Geser Handle Melengkung',
    d: 'Saat aktif, menggeser handle Bézier pada mode No Mirroring akan otomatis membentuk lengkungan busur yang luwes (mengatur kelengkungan segmen secara independen tanpa ikut memutar handle di sisi seberang node).',
    w: 'Aktifkan di floating toolbar saat ingin menarik garis lurus/handle menjadi melengkung dengan bebas.'
  },
  veCopy: {
    t: 'Salin (format terpilih)',
    d: 'SVG/AI/EPS/PS disalin sebagai teks; PNG/JPG/WEBP sebagai gambar PNG. Ctrl+C pada objek menyalin kode SVG + gambar PNG sekaligus.'
  },
  veDownload: {
    t: 'Unduh (format terpilih)',
    d: 'Mengunduh hasil edit sebagai .svg, .png, .jpg, .webp, .ai, .eps atau .ps (Ctrl+S).'
  },
  veFill: {
    t: 'Fill',
    d: 'Warna isi path terpilih.'
  },
  veStroke: {
    t: 'Stroke',
    d: 'Warna garis tepi path terpilih.'
  },
  veStrokeW: {
    t: 'Stroke width',
    d: 'Ketebalan garis tepi dalam unit dokumen.'
  },
  veOpacity: {
    t: 'Opacity',
    d: 'Transparansi path terpilih (0–100%).'
  },
  veLayer: {
    t: 'Layer',
    d: 'Klik untuk memilih objek. Shift untuk multi-seleksi.'
  },
  veImport: {
    t: 'Impor SVG / AI / EPS / gambar',
    d: 'Menambahkan satu atau banyak file ke kanvas: SVG, AI, EPS, PS, PDF (menjadi objek vektor yang bisa diedit) atau gambar PNG/JPG/WebP/GIF. Tipe file dikenali dari isinya (magic byte). File ditambahkan di tengah tampilan dan tidak menggantikan isi kanvas. Bisa juga seret-lepas file ke kanvas atau tempel dengan Ctrl+V.'
  },
  veBg: {
    t: 'Latar belakang kanvas',
    d: 'Transparan: kanvas tampil dengan pola kotak-kotak dan ekspor SVG tanpa latar. Solid: kanvas diisi warna pilihan dan ekspor SVG menyertakan persegi latar berwarna.'
  },
  veBgTr: {
    t: 'Transparan',
    d: 'Tanpa latar belakang (pola kotak-kotak).'
  },
  veBgSolid: {
    t: 'Solid',
    d: 'Latar belakang berwarna polos.'
  },
  veBgColor: {
    t: 'Warna latar',
    d: 'Warna latar belakang saat mode Solid.'
  },
  veAreaBoard: {
    t: 'Artboard',
    d: 'Ekspor hanya area bingkai (viewBox asli).'
  },
  veAreaAll: {
    t: 'Semua konten',
    d: 'Ekspor kotak yang pas membungkus seluruh objek di kanvas, termasuk yang di luar artboard.'
  },
  veAreaSel: {
    t: 'Objek seleksi',
    d: 'Ekspor hanya objek yang sedang dipilih, dipotong pas mengikuti batas objek tersebut. Objek lain tidak ikut. Pilih objek dulu sebelum menyalin atau mengunduh.',
    w: 'Mengambil satu bagian atau satu ikon dari desain besar.'
  },
  veArea: {
    t: 'Area ekspor',
    d: 'Artboard: hanya area bingkai (viewBox asli). Semua konten: kotak yang pas membungkus seluruh objek di kanvas, termasuk yang di luar artboard.'
  },
  veZoomOut: {
    k: '-',
    t: 'Perkecil',
    d: 'Memperkecil tampilan canvas editor (zoom ke pusat).'
  },
  veZoomIn: {
    k: '+',
    t: 'Perbesar',
    d: 'Memperbesar tampilan canvas editor (zoom ke pusat).'
  },
  veZoomFit: {
    k: '0',
    t: 'Pas',
    d: 'Menyesuaikan zoom agar seluruh viewBox muat di canvas dan dipusatkan.'
  },
  veDup: {
    k: 'Ctrl + D',
    t: 'Duplikat',
    d: 'Menggandakan objek terpilih (digeser 10 unit).'
  },
  veDelObj: {
    k: 'Delete',
    t: 'Hapus',
    d: 'Menghapus node terpilih; jika tidak ada node terpilih, menghapus objek terpilih.'
  },
  veUp: {
    k: ']',
    t: 'Naikkan layer',
    d: 'Memindahkan objek terpilih satu langkah ke depan.'
  },
  veDown: {
    k: '[',
    t: 'Turunkan layer',
    d: 'Memindahkan objek terpilih satu langkah ke belakang.'
  },
  veInsert: {
    t: 'Sisipkan node',
    d: 'Menambah node di tengah segmen antara dua node bersebelahan yang terpilih. Atau klik dua kali pada garis path.'
  },
  veFillNone: {
    t: 'Fill kosong',
    d: 'Aktif/nonaktifkan isi warna objek.'
  },
  veStrokeNone: {
    t: 'Stroke kosong',
    d: 'Aktif/nonaktifkan garis tepi objek.'
  },
  veZoomSl: {
    k: '+ | - | Scroll',
    t: 'Zoom',
    d: 'Memperbesar atau memperkecil kanvas tanpa batas praktis (0,05% sampai 500.000%). Scroll mouse mengikuti posisi kursor; tombol ± ke pusat.'
  },
  veSimplify: {
    k: 'S',
    t: 'Simplify',
    d: 'Menyederhanakan path kurva Bézier dengan algoritma least-squares cubic fitting VectorCraft (Object › Path › Simplify).',
    w: 'Mengurangi jumlah anchor point sambil menjaga presisi bentuk dan sudut.'
  },
  veBoolUnion: {
    k: 'Ctrl+Alt+U',
    t: 'Boolean Union',
    d: 'Menggabungkan 2+ objek path tertutup terpilih menjadi satu bentuk (Object › Path › Union). Subpath terbuka dilewati.',
    w: 'Hasil memakai fill objek paling bawah dan fill-rule evenodd.'
  },
  veBoolSubtract: {
    k: 'Ctrl+Alt+S',
    t: 'Boolean Subtract',
    d: 'Memotong bentuk terpilih dengan objek paling atas (paling depan) sebagai pemotong (Object › Path › Subtract).',
    w: 'Objek paling atas dihapus; sisanya menjadi satu bentuk.'
  },
  veBoolIntersect: {
    k: 'Ctrl+Alt+I',
    t: 'Boolean Intersect',
    d: 'Menyisakan hanya daerah yang tumpang tindih dari semua objek path tertutup terpilih (Object › Path › Intersect).'
  },
  veBoolExclude: {
    k: 'Ctrl+Alt+X',
    t: 'Boolean Exclude (XOR)',
    d: 'Menyisakan daerah yang hanya dimiliki satu objek — daerah tumpang tindih dibuang (Object › Path › Exclude).'
  },
  veOutlineStroke: {
    k: 'Ctrl+Alt+O',
    t: 'Outline Stroke',
    d: 'Mengubah stroke objek terpilih menjadi bentuk berisi (fill = warna stroke, stroke dihapus). Fill lama dibuang. Penting untuk logo, cetak, dan laser cutting.'
  },
  veOffsetPath: {
    t: 'Offset Path',
    d: 'Memperbesar (+) atau memperkecil (−) path terpilih sejauh jarak tertentu, dengan pratinjau langsung. Join Miter/Bevel/Round; path yang menyusut sampai lenyap dibiarkan utuh.'
  },
  veOffsetDist: {
    t: 'Jarak Offset (pt)',
    d: 'Jarak perluasan (+) atau penyusutan (−) path, −100 sampai +100 pt. Pratinjau diperbarui langsung di kanvas.'
  },
  veOffsetJoin: {
    t: 'Join Offset',
    d: 'Bentuk sudut pada path hasil offset: Miter (runcing), Bevel (terpotong), atau Round (membulat).'
  },
  veOffsetBadge: {
    t: 'Offset & Anchor Points',
    d: 'Jarak offset saat ini dan jumlah anchor point sebelum → sesudah offset.'
  },
  veOffsetApply: {
    t: 'Terapkan Offset',
    d: 'Komit hasil Offset ke path sebagai satu langkah Undo.'
  },
  veOffsetCancel: {
    t: 'Batalkan Offset',
    d: 'Membatalkan Offset dan mengembalikan path seperti semula.'
  },
  veShape: {
    t: 'Shape',
    d: 'Pilih bentuk dasar (persegi, lingkaran, bintang, panah, hati, dll.), lalu seret di kanvas untuk menggambar. Klik sekali untuk ukuran bawaan. Shift = proporsional.',
    w: 'Menambah bentuk baru ke kanvas sebagai path yang bisa diedit node-nya.'
  },
  veShowNodeGlobal: {
    t: 'Tampilkan Node (Global)',
    d: 'Menampilkan atau menyembunyikan node pada setiap objek yang dipilih. Pengaturan berlaku global untuk semua seleksi objek dan berfungsi juga di mode Pilih (Select).'
  },
  veShowHandleGlobal: {
    t: 'Tampilkan Handle Bézier (Global)',
    d: 'Menampilkan atau menyembunyikan handle Bézier pada setiap objek yang dipilih. Pengaturan berlaku global untuk semua seleksi objek dan berfungsi juga di mode Pilih (Select).'
  },
  veSimplifyTol: {
    t: 'Tolerance (pt)',
    d: 'Jarak simpangan maksimum (poin dokumen) antara path asli dan path hasil Simplify (0.001–10000 pt).'
  },
  veApplySimplify: {
    t: 'Terapkan Simplify',
    d: 'Komit hasil Simplify ke path sebagai satu langkah Undo.'
  },
  veSimplifyAuto: {
    t: 'Auto-Simplify',
    d: 'Menentukan level Simplify otomatis dari ukuran objek terpilih (size / 400).'
  },
  veSimplifyLevel: {
    t: 'Simplify Slider (0–100)',
    d: 'Kiri (0) = paling sedikit anchor point (32 pt); Tengah (50) = 1 pt; Kanan (100) = paling rapat ke path asli (1/32 pt).'
  },
  veSimplifyMore: {
    t: 'More Options…',
    d: 'Buka dialog Simplify lengkap (Tolerance, Corner Point Angle Threshold, Convert to Straight Lines, Show Original Path).'
  },
  veSimplifyAngle: {
    t: 'Corner Point Angle Threshold',
    d: 'Sudut di bawah ambang ini (0°–180°, default 150° → belokan > 30°) dipertahankan sebagai sudut tajam.'
  },
  veSimplifyStraight: {
    t: 'Convert to Straight Lines',
    d: 'Menghasilkan segmen garis lurus saja menggunakan reduksi polilin Ramer–Douglas–Peucker (RDP).'
  },
  veSimplifyOrig: {
    t: 'Show Original Path',
    d: 'Tampilkan kontur path asli sebelum Simplify di bawah pratinjau kanvas.'
  },
  veSimplifyRetain: {
    t: 'Open this dialog with these settings next time',
    d: 'Langsung membuka dialog Simplify penuh dengan pengaturan ini pada pemanggilan berikutnya.'
  },
  veColorText: {
    t: 'Nilai warna',
    d: 'Ketik warna CSS: hex (#e11d48), nama (red), rgb() atau hsl(). Tekan Enter untuk menerapkan, Esc untuk membatalkan.'
  },
  veFillRule: {
    t: 'Fill rule',
    d: 'Aturan untuk menentukan area mana yang terisi saat path saling tumpang tindih atau berlubang.'
  },
  veFillNonzero: {
    t: 'Nonzero',
    d: 'Semua area di dalam kontur terisi, tergantung arah gambar path.',
    w: 'Bentuk biasa tanpa lubang, atau lubang yang arahnya sudah benar.'
  },
  veFillEvenodd: {
    t: 'Even-odd',
    d: 'Area yang dilingkupi kontur berjumlah ganjil terisi, genap berlubang, tanpa peduli arah path.',
    w: 'Huruf, cincin, atau bentuk dengan lubang yang tidak muncul.'
  },
  veCornerCirc: {
    t: 'Circular',
    d: 'Sudut dibulatkan dengan busur lingkaran presisi.'
  },
  veAnomFilter: {
    t: 'Kategori anomali',
    d: 'Menyaring daftar dan penanda di canvas: Sudut (node menumpuk), Kolinier (node redundan), Meleyot (garis bergelombang), Faset (lengkung patah), Arc (arc terlalu padat).'
  },
  veAnomList: {
    t: 'Daftar anomali',
    d: 'Anomali geometri yang ditemukan pada path, sesuai kategori yang dipilih.'
  },
  veStats: {
    t: 'Statistik dokumen',
    d: 'Jumlah objek, total node, dan objek atau node yang sedang dipilih.'
  },
  veZoomPct: {
    t: 'Level zoom',
    d: 'Persentase pembesaran canvas saat ini. 100% = ukuran asli.'
  },
  veAppear: {
    t: 'Appearance',
    d: 'Properti tampilan objek terpilih. Jika beberapa objek dipilih, perubahan berlaku untuk semuanya.'
  },
  veLayers: {
    t: 'Daftar layer',
    d: 'Objek diurutkan dari paling depan di atas. Klik untuk memilih, Shift atau Ctrl untuk multi-seleksi.'
  },
  cpSV: {
    t: 'Saturasi & kecerahan',
    d: 'Seret untuk mengatur kepekatan (kiri ke kanan) dan kecerahan (bawah ke atas) warna.'
  },
  cpHue: {
    t: 'Hue',
    d: 'Geser untuk memilih rona warna dasar. Panah keyboard menggeser 1 derajat.'
  },
  cpPipette: {
    t: 'Pipet warna',
    d: 'Ambil warna dari mana saja di layar. Di browser tanpa dukungan pipet bawaan, pipet mengambil warna elemen SVG, canvas, atau gambar di halaman. Esc untuk batal.'
  },
  cpHex: {
    t: 'Kode hex',
    d: 'Ketik 6 digit hex warna (tanpa #). Diterapkan otomatis saat lengkap.'
  },
  /* --- Multi-Snap & Checklist --- */
  veSnapMenu: {
    t: 'Checklist fitur snap',
    d: 'Pilih target snap mana saja yang aktif saat menggeser objek, node, atau handle.',
    w: 'Matikan opsi tertentu jika kursor terasa terlalu sering menempel di area padat.'
  },
  veSnapPresetDef: {
    t: 'Preset bawaan',
    d: 'Mengembalikan checklist ke pengaturan bawaan: semua panduan pintar dan grid aktif, tanpa pembulatan piksel.'
  },
  veSnapPresetAll: {
    t: 'Aktifkan semua',
    d: 'Mengaktifkan seluruh target snap dari Smart Guides sampai Grid untuk presisi maksimum. Pembulatan piksel tidak diubah.'
  },
  veSnapPresetMin: {
    t: 'Mode minimal',
    d: 'Hanya menempel ke titik node & handle; panduan kotak, jarak, dan target lain dimatikan.',
    w: 'Saat snap lain terasa mengganggu dan Anda hanya butuh kunci ke node.'
  },
  veSnap_bbox: {
    t: 'Smart Guides (Kotak & Pusat)',
    d: 'Menempel ke tepi kiri, kanan, atas, bawah, serta titik tengah kotak pembatas objek lain.'
  },
  veSnap_spacing: {
    t: 'Jarak Sama Rata (Equal Spacing)',
    d: 'Mendeteksi dan mengunci jarak kosong yang sama persis di antara 3 objek atau lebih yang sejajar.'
  },
  veSnap_artboard: {
    t: 'Tepi & Pusat Artboard',
    d: 'Menempel ke batas pinggir serta garis tengah horizontal dan vertikal kanvas (viewBox).'
  },
  veSnap_node: {
    t: 'Titik Node & Handle',
    d: 'Menempel langsung (kunci 2D) ke titik node atau ujung handle Bézier milik objek lain.'
  },
  veSnap_axial: {
    t: 'Sejajar Sumbu Node (X/Y)',
    d: 'Menampilkan garis bantu saat posisi X atau Y sejajar lurus dengan node lain atau pangkal handle sendiri.'
  },
  veSnap_midpoint: {
    t: 'Titik Tengah Segmen (Midpoint)',
    d: 'Menempel ke titik tengah dari setiap segmen garis maupun kurva Bézier.'
  },
  veSnap_edge: {
    t: 'Kontur / Tepi Path',
    d: 'Menempelkan node atau objek tepat menyentuh garis tepi (kontur) objek lain.'
  },
  veSnap_perp: {
    t: 'Siku (90°) & Perpanjangan Garis',
    d: 'Mengunci gerakan node pada sudut siku-siku (90°) atau perpanjangan lurus dari segmen tetangganya.'
  },
  veSnap_grid: {
    t: 'Garis Grid Adaptif',
    d: 'Menempel ke persimpangan dan garis grid. Butuh tombol Grid di toolbar dalam keadaan aktif.'
  },
  veSnap_pixel: {
    t: 'Bulatkan ke Piksel (1 px)',
    d: 'Membulatkan koordinat akhir ke bilangan bulat terdekat agar hasil tajam di layar resolusi rendah.'
  },
  /* --- Sejajarkan Node & Sudut --- */
  veCurAngle: {
    t: 'Sudut garis saat ini',
    d: 'Kemiringan garis antara node pertama dan terakhir yang dipilih (0° = mendatar, 90° = tegak).'
  },
  veAlMode: {
    t: 'Mode sudut sejajar',
    d: 'Cara menentukan arah garis target saat menyejajarkan 2 node atau lebih.'
  },
  veAlAuto: {
    t: 'Auto',
    d: 'Menentukan garis lurus terbaik dari posisi node terpilih, lalu otomatis mengunci ke mendatar/tegak jika kemiringannya sangat kecil.',
    w: 'Garis yang hampir lurus dan Anda tidak ingin menentukan sudut sendiri.'
  },
  veAlCustom: {
    t: 'Derajat kustom',
    d: 'Menyejajarkan node mengikuti sudut derajat pilihan Anda (slider atau preset).'
  },
  veAlPerp: {
    t: 'Siku-siku (⊥ 90°)',
    d: 'Menyejajarkan node agar tegak lurus (90°) terhadap arah rata-rata batang/sisi di kiri-kanannya.',
    w: 'Merapikan ujung potongan garis atau kaki huruf yang miring.'
  },
  veAlPar: {
    t: 'Sejajar sisi seberang (∥)',
    d: 'Menyejajarkan node agar paralel dengan segmen di sisi seberangnya pada subpath yang sama (butuh minimal 4 node).'
  },
  veAlDeg: {
    t: 'Sudut garis (derajat)',
    d: 'Atur kemiringan garis target dari -180° hingga 180° (0° = mendatar, 90° = tegak). Perubahan langsung diterapkan pada node terpilih.'
  },
  veAlPreset: {
    t: 'Preset derajat cepat',
    d: 'Klik untuk langsung menyejajarkan node terpilih ke sudut standar ini.'
  },
  veAlAnchor: {
    t: 'Titik patokan (Anchor)',
    d: 'Menentukan titik mana yang tetap diam sebagai poros perataan garis.'
  },
  veAlAncCenter: {
    t: 'Patokan tengah',
    d: 'Garis perataan melewati titik tengah semua node terpilih.'
  },
  veAlAncFirst: {
    t: 'Patokan node awal',
    d: 'Node pertama dalam urutan path tetap diam; node lainnya menyesuaikan.'
  },
  veAlAncLast: {
    t: 'Patokan node akhir',
    d: 'Node terakhir dalam urutan path tetap diam; node lainnya menyesuaikan.'
  },
  veAlSlide: {
    t: 'Cara geser node ujung',
    d: 'Menentukan jalur pergeseran node ujung saat diratakan.'
  },
  veAlSlideOn: {
    t: 'Ikuti rel sisi (Edge-Sliding)',
    d: 'Node ujung digeser mengikuti perpanjangan garis sisi tetangganya, sehingga ketebalan dan kemiringan batang di sampingnya tidak berubah.',
    w: 'Meratakan ujung pita, balok miring, atau kaki huruf.'
  },
  veAlSlideOff: {
    t: 'Proyeksi tegak lurus',
    d: 'Node dijatuhkan langsung secara tegak lurus ke garis target.'
  },
  veAlCollapse: {
    t: 'Node perantara',
    d: 'Perlakuan terhadap node tengah saat Anda memilih 3 node atau lebih secara berurutan.'
  },
  veAlKeep: {
    t: 'Pertahankan',
    d: 'Node di antara dua ujung tetap ada dan ikut diratakan ke garis target.'
  },
  veAlMerge: {
    t: 'Lebur jadi 2 ujung',
    d: 'Node perantara dihapus sehingga rantai menjadi satu segmen lurus antara node awal dan akhir.',
    w: 'Mengurangi jumlah node pada sisi yang sudah lurus.'
  },
  /* --- Radius Sudut & Preset Node --- */
  veCornerSq: {
    t: 'Squircle',
    d: 'Sudut dibulatkan dengan handle Bézier lebih panjang sehingga transisi lebih lembut. Atur dengan slider Kehalusan.'
  },
  veCornerChamfer: {
    t: 'Bevel (Chamfer)',
    d: 'Memotong sudut tajam menjadi garis miring lurus (tanpa lengkungan handle).'
  },
  veRadiusPreset: {
    t: 'Preset radius cepat',
    d: 'Klik untuk langsung menerapkan ukuran radius ini pada sudut terpilih (Tajam = kembalikan ke 0).'
  },
  veBevelDeg: {
    t: 'Preset sudut bukaan',
    d: 'Mengatur proporsi jarak titik potong sudut sesuai derajat bukaan (Auto = mengikuti sudut asli geometri).'
  },
  /* --- Pustaka Bentuk & Menu Klik Kanan --- */
  veShapeItem: {
    t: 'Bentuk',
    d: 'Seret di kanvas untuk menggambar, atau klik sekali untuk ukuran bawaan. Tahan Shift agar proporsi 1:1.'
  },
  veCtxFlatten: {
    k: 'Ctrl + E',
    t: 'Flatten',
    d: 'Menggabungkan 2 objek atau lebih menjadi satu path (atribut mengikuti objek paling atas). Jika hanya satu objek di dalam grup, objek dilepas dari grupnya.',
    w: 'Membuat lubang/gabungan bentuk dari beberapa path.'
  },
  veCtxGroup: {
    k: 'Ctrl + G',
    t: 'Group',
    d: 'Mengelompokkan 2 objek atau lebih agar terpilih dan bergerak bersama. Menekan Ctrl+G pada satu grup utuh tetap melepasnya (kompatibel dengan versi lama).'
  },
  veCtxUngroup: {
    k: 'Ctrl + Shift + G',
    t: 'Ungroup',
    d: 'Melepas grup atau Frame dari objek terpilih: seluruh child element dikeluarkan ke kanvas dan tetap terpilih (kotak latar Frame ikut dihapus). Seleksi sebagian anggota pun melepas induknya.',
    w: 'Mengedit satu objek di dalam grup tanpa mengubah yang lain.'
  },
  /* --- Multi-Format Ekspor & Lainnya --- */
  veExpFmt: {
    t: 'Format ekspor & salin',
    d: 'Pilih format berkas: vektor murni (SVG, AI, EPS, PS) atau gambar raster (PNG, JPG, WEBP).'
  },
  veExp_svg: {
    t: 'SVG',
    d: 'Vektor SVG murni; ukuran tetap tajam di semua skala dan bisa dibuka lagi di sini tanpa kehilangan data.'
  },
  veExp_png: {
    t: 'PNG',
    d: 'Gambar raster dengan transparansi. Pilih skala resolusi di bawahnya.'
  },
  veExp_jpg: {
    t: 'JPG',
    d: 'Gambar raster terkompresi tanpa transparansi; latar otomatis putih (atau warna latar solid).'
  },
  veExp_webp: {
    t: 'WEBP',
    d: 'Gambar raster modern berukuran kecil dengan dukungan transparansi.'
  },
  veExp_ai: {
    t: 'Adobe Illustrator (.AI)',
    d: 'Berkas PDF-1.4 berekstensi .ai plus data round-trip Geovanta agar lossless saat dibuka kembali di sini.'
  },
  veExp_eps: {
    t: 'EPS (PostScript)',
    d: 'PostScript EPSF-3.0 untuk alur kerja cetak dan aplikasi desain lama.'
  },
  veExpScale: {
    t: 'Skala resolusi raster',
    d: 'Pengali resolusi saat mengekspor ke PNG, JPG, atau WEBP. 2x dan 4x menghasilkan gambar jauh lebih tajam (supersampling).'
  },
  veExpS_1: {
    t: '1x',
    d: 'Ukuran asli sesuai viewBox; file paling kecil.'
  },
  veExpS_2: {
    t: '2x (HD)',
    d: 'Resolusi dua kali lipat; cocok untuk layar retina dan web.'
  },
  veExpS_4: {
    t: '4x (Ultra)',
    d: 'Resolusi empat kali lipat; file besar dan lebih lambat diproses.',
    w: 'Untuk cetak atau gambar yang akan diperbesar.'
  },
  setTabUmum: {
    t: 'Pengaturan umum',
    d: 'Tema warna, animasi, tooltip, dan penyimpanan preferensi.'
  },
  setTabKeys: {
    t: 'Pintasan keyboard',
    d: 'Daftar lengkap seluruh pintasan keyboard Vector Editor.'
  },
  setTabTech: {
    t: 'Teknologi & arsitektur',
    d: 'Daftar pustaka dan API browser yang digunakan.'
  },
  /* --- Alignment, Transform & Auto Layout (v4.4) --- */
  veAlnPanel: {
    t: 'Alignment & Distribusi',
    d: 'Meratakan dan mendistribusikan objek. Satu objek diratakan ke Artboard, dua objek atau lebih ke kotak pembatas seleksi, dan dua node atau lebih ke kotak pembatas node.'
  },
  veAlnLeft: {
    t: 'Rata kiri',
    d: 'Menggeser objek (atau node) agar tepi kirinya sejajar dengan tepi kiri acuan.'
  },
  veAlnHC: {
    t: 'Rata tengah horizontal',
    d: 'Menyejajarkan titik tengah horizontal dengan titik tengah acuan.'
  },
  veAlnRight: {
    t: 'Rata kanan',
    d: 'Menggeser objek (atau node) agar tepi kanannya sejajar dengan tepi kanan acuan.'
  },
  veAlnTop: {
    t: 'Rata atas',
    d: 'Menggeser objek (atau node) agar tepi atasnya sejajar dengan tepi atas acuan.'
  },
  veAlnVC: {
    t: 'Rata tengah vertikal',
    d: 'Menyejajarkan titik tengah vertikal dengan titik tengah acuan.'
  },
  veAlnBottom: {
    t: 'Rata bawah',
    d: 'Menggeser objek (atau node) agar tepi bawahnya sejajar dengan tepi bawah acuan.'
  },
  veAlnDistH: {
    t: 'Distribusi horizontal',
    d: 'Membuat celah kosong antar objek sama rata dari kiri ke kanan. Objek paling kiri dan paling kanan tetap di tempat.',
    w: 'Butuh minimal 3 objek.'
  },
  veAlnDistV: {
    t: 'Distribusi vertikal',
    d: 'Membuat celah kosong antar objek sama rata dari atas ke bawah. Objek paling atas dan paling bawah tetap di tempat.',
    w: 'Butuh minimal 3 objek.'
  },
  veXfPanel: {
    t: 'Transform',
    d: 'Atur posisi (X, Y), ukuran (W, H), dan rotasi seleksi dengan angka presisi. Titik poros 9-titik menentukan acuan pengukuran.'
  },
  veXfX: {
    t: 'Posisi X',
    d: 'Koordinat horizontal titik poros pada kotak pembatas seleksi. Ketik angka lalu Enter; panah atas/bawah = ±1 (Shift = ±10).'
  },
  veXfY: {
    t: 'Posisi Y',
    d: 'Koordinat vertikal titik poros pada kotak pembatas seleksi. Ketik angka lalu Enter; panah atas/bawah = ±1 (Shift = ±10).'
  },
  veXfW: {
    t: 'Lebar (W)',
    d: 'Lebar kotak pembatas seleksi. Objek diskalakan terhadap titik poros; bentuk kurva dan handle ikut berubah proporsional.',
    w: 'Tidak tersedia saat mengedit node.'
  },
  veXfH: {
    t: 'Tinggi (H)',
    d: 'Tinggi kotak pembatas seleksi. Objek diskalakan terhadap titik poros; bentuk kurva dan handle ikut berubah proporsional.',
    w: 'Tidak tersedia saat mengedit node.'
  },
  veXfRot: {
    t: 'Rotasi (°)',
    d: 'Sudut putar objek, dari -180° hingga 180°. Sudut tercatat pada objek sehingga tetap terbaca setelah diputar. Pada seleksi banyak objek, nilai dianggap putaran relatif dari 0°.',
    w: 'Tidak tersedia saat mengedit node.'
  },
  veXfLock: {
    t: 'Kunci proporsi',
    d: 'Saat aktif, mengubah W otomatis mengubah H dengan rasio yang sama (dan sebaliknya).'
  },
  veXfFlipH: {
    t: 'Flip horizontal',
    d: 'Mencerminkan seleksi kiri-kanan terhadap titik pusat (atau titik poros).'
  },
  veXfFlipV: {
    t: 'Flip vertikal',
    d: 'Mencerminkan seleksi atas-bawah terhadap titik pusat (atau titik poros).'
  },
  veXfPin: {
    t: 'Titik poros 9-titik',
    d: 'Memilih titik acuan pada kotak pembatas: dipakai untuk membaca X/Y, sebagai titik diam saat W/H diubah, dan sebagai pusat putar bila "Poros" dipilih.'
  },
  veXfPivot: {
    t: 'Pusat putar & flip',
    d: 'Menentukan titik tetap saat memutar atau mencerminkan seleksi.'
  },
  veXfPivC: {
    t: 'Dari pusat',
    d: 'Memutar dan mencerminkan terhadap titik tengah kotak pembatas.'
  },
  veXfPivP: {
    t: 'Dari titik poros',
    d: 'Memutar dan mencerminkan terhadap titik poros 9-titik yang sedang dipilih.'
  },
  veXfStroke: {
    t: 'Skala stroke',
    d: 'Saat aktif, ketebalan stroke ikut diskalakan ketika W/H diubah. Saat mati, ketebalan stroke tetap.'
  },
  veLayPanel: {
    t: 'Auto Layout & Padding',
    d: 'Menata objek terpilih dalam baris, kolom, atau grid dengan jarak (gap), perataan, padding 4 sisi, dan frame latar otomatis. Setelah diterapkan, mengubah kontrol di sini langsung menata ulang.'
  },
  veLayDir: {
    t: 'Arah tata letak',
    d: 'Menentukan bagaimana objek disusun.'
  },
  veLayRow: {
    t: 'Baris (→)',
    d: 'Semua objek disusun mendatar dari kiri ke kanan.'
  },
  veLayCol: {
    t: 'Kolom (↓)',
    d: 'Semua objek disusun menurun dari atas ke bawah.'
  },
  veLayWrap: {
    t: 'Grid (⊞)',
    d: 'Objek disusun mendatar lalu turun ke baris berikutnya setiap kali jumlah kolom tercapai.'
  },
  veLayCols: {
    t: 'Kolom per baris',
    d: 'Jumlah objek maksimum dalam satu baris pada mode Grid.',
    up: 'Ingin grid lebih lebar dan lebih sedikit baris.',
    dn: 'Ingin grid lebih sempit dan lebih tinggi.'
  },
  veLayGap: {
    t: 'Gap antar objek',
    d: 'Jarak kosong antar objek yang berdampingan.',
    up: 'Objek terlihat terlalu rapat.',
    dn: 'Ingin susunan lebih padat.'
  },
  veLayPad: {
    t: 'Padding',
    d: 'Jarak kosong antara frame dan objek di dalamnya. Mode Simetris memakai satu nilai untuk keempat sisi.'
  },
  veLayPadMode: {
    t: 'Mode padding',
    d: 'Simetris = satu nilai untuk semua sisi. 4 sisi = atur atas, kanan, bawah, dan kiri sendiri-sendiri.'
  },
  veLayPadT: {
    t: 'Padding atas (T)',
    d: 'Jarak frame ke objek paling atas.'
  },
  veLayPadR: {
    t: 'Padding kanan (R)',
    d: 'Jarak frame ke objek paling kanan.'
  },
  veLayPadB: {
    t: 'Padding bawah (B)',
    d: 'Jarak frame ke objek paling bawah.'
  },
  veLayPadL: {
    t: 'Padding kiri (L)',
    d: 'Jarak frame ke objek paling kiri.'
  },
  veLayAlign: {
    t: 'Perataan 9-titik',
    d: 'Menentukan posisi objek di dalam baris atau kolomnya saat ukurannya berbeda-beda: kiri/tengah/kanan dan atas/tengah/bawah.'
  },
  veLayFrame: {
    t: 'Frame latar',
    d: 'Membuat persegi latar otomatis di belakang objek, selebar isi ditambah padding. Mematikannya akan menghapus frame otomatis tersebut.',
    w: 'Kartu, tombol, atau grup ikon yang butuh latar.'
  },
  veLayRadius: {
    t: 'Radius frame',
    d: 'Kebulatan sudut frame latar otomatis.'
  },
  veLayBucket: {
    t: 'Gabung Warna',
    d: 'Objek berwarna sama di dalam satu Frame/Group digabung menjadi satu baris. Klik baris itu untuk memilih semuanya, lalu ubah fill, stroke, dan radius sekaligus.'
  },
  veFrameTool: {
    t: 'Frame',
    d: 'Seret di kanvas untuk menggambar Frame; objek yang pusatnya berada di dalam area otomatis masuk ke Frame. Klik sekali: membungkus objek terpilih ke dalam Frame (atau membuat Frame kosong bila tak ada seleksi).',
    w: 'Membuat wadah/artboard kecil ala Figma yang bisa dipakai untuk Auto Layout.'
  },
  veFrameAuto: {
    t: 'Frame → Auto Layout',
    d: 'Mengubah Frame dari objek terpilih menjadi Auto Layout. Arah (baris/kolom/wrap), gap dan padding disimpulkan dari posisi objek sekarang agar tidak melompat.'
  },
  veLayApply: {
    t: 'Terapkan Auto Layout',
    d: 'Menata objek terpilih sesuai pengaturan di atas. Setelah itu, mengubah gap, padding, arah, atau perataan langsung menata ulang selama seleksi yang sama masih aktif.'
  },
  veLayArtboard: {
    t: 'Padding ke Artboard',
    d: 'Mengubah ukuran Artboard (viewBox) agar mengelilingi objek terpilih, atau seluruh konten bila tidak ada yang dipilih, dengan padding 4 sisi di atas.',
    w: 'Merapikan ruang kosong sebelum ekspor.'
  },
  /* ---- Migrasi tooltip sederhana (title=) ke tooltip kustom ---- */
  veTextTool: {
    k: 'T',
    t: 'Alat Teks',
    d: 'Klik di kanvas untuk membuat objek teks SVG.'
  },
  veBackWorkspace: {
    t: 'Kembali ke Workspace',
    d: 'Kembali ke daftar proyek. Proyek tersimpan otomatis.'
  },
  veRenameProject: {
    t: 'Ganti Nama Proyek',
    d: 'Klik untuk mengganti nama proyek.'
  },
  veSimpBadge: {
    t: 'Anchor Points',
    d: 'Jumlah anchor point sebelum dan sesudah simplify.'
  },
  veUndo: {
    k: 'Ctrl + Z',
    t: 'Undo',
    d: 'Membatalkan perubahan terakhir.'
  },
  veRedo: {
    k: 'Ctrl + Y',
    t: 'Redo',
    d: 'Mengulangi perubahan yang dibatalkan.'
  },
  vePixelMode: {
    t: 'Mode Piksel',
    d: 'Mengaktifkan / menonaktifkan mode piksel pada kanvas.'
  },
  veTextNewLine: {
    t: 'Baris Baru',
    d: 'Menambah baris baru pada teks.'
  },
  veFontSearchReset: {
    t: 'Reset Pencarian Font',
    d: 'Menghapus teks pencarian font.'
  },
  veFontRemove: {
    t: 'Hapus Font dari Daftar',
    d: 'Menghapus font dari daftar. Objek teks tetap aman.'
  },
  veFontSizeDown: {
    t: 'Perkecil Teks',
    d: 'Memperkecil ukuran teks.'
  },
  veFontSizeUp: {
    t: 'Perbesar Teks',
    d: 'Memperbesar ukuran teks.'
  },
  veToggleHidden: {
    k: 'Ctrl + Shift + H',
    t: 'Tampilkan / Sembunyikan Layer',
    d: 'Menampilkan atau menyembunyikan layer terpilih.'
  },
  vePipetteFill: {
    t: 'Pipet Warna Fill',
    d: 'Mengambil sampel warna dari kanvas untuk fill.'
  },
  vePipetteStroke: {
    t: 'Pipet Warna Stroke',
    d: 'Mengambil sampel warna dari kanvas untuk stroke.'
  },
  veSimpCancel: {
    k: 'Esc',
    t: 'Batalkan Simplify',
    d: 'Membatalkan simplify tanpa menerapkan perubahan.'
  },
  vePxSmooth: {
    t: 'Mode 1 — Smooth Vector (Default)',
    d: 'Kontur vektor tetap halus dan solid tanpa kotak piksel tepi.'
  },
  vePxHard: {
    t: 'Mode 3 — Hard Pixel Preview',
    d: 'Rasterizer biner per-objek, warna piksel kotak 100% solid tegas tanpa warna campuran/transparan di tepi.'
  },
  vePxCoverage: {
    t: 'Mode 2 — Pixel Coverage Preview',
    d: 'Menampilkan tingkat coverage antialiasing setiap piksel.'
  },
  veAlphaPct: {
    t: 'Transparansi (%)',
    d: 'Tingkat transparansi warna dalam persen.'
  },
  veNoColor: {
    t: 'Hapus Warna (No Color)',
    d: 'Menghapus warna / menyetel ke None (transparan penuh).'
  },
  veRangeScrub: {
    t: 'Geser Nilai',
    d: 'Seret kiri/kanan untuk mengubah nilai.'
  },
  veRangeType: {
    t: 'Ketik Angka',
    d: 'Klik untuk mengetik angka langsung.'
  },
  veStorageInfo: {
    t: 'Informasi Penyimpanan Lokal',
    d: 'Melihat pemakaian penyimpanan lokal (IndexedDB).'
  },
  veClearSearch: {
    t: 'Bersihkan Pencarian',
    d: 'Menghapus teks pencarian.'
  },
  veSaveOk: {
    t: 'Status Penyimpanan',
    d: 'Status penyimpanan proyek lokal (IndexedDB).'
  },
  veSaveError: {
    t: 'Gagal Menyimpan',
    d: 'Klik untuk mencoba menyimpan kembali.'
  },
  veLayerText: {
    t: 'Objek Teks SVG',
    d: 'Layer ini adalah objek teks SVG.'
  },
  veLayerImage: {
    t: 'Objek Gambar',
    d: 'Layer ini adalah objek gambar.'
  },
  veLayerShape: {
    t: 'Pratinjau Bentuk SVG',
    d: 'Layer ini adalah bentuk SVG.'
  },
  veSidebarHide: {
    t: 'Sembunyikan Panel Layer',
    d: 'Menyembunyikan panel layer di sisi kiri.'
  },
  veSidebarShow: {
    t: 'Tampilkan Panel Layer',
    d: 'Menampilkan panel layer di sisi kiri.'
  },
  veFavAdd: {
    t: 'Tambahkan ke Favorit',
    d: 'Menandai proyek ini sebagai favorit.'
  },
  veFavRemove: {
    t: 'Hapus dari Favorit',
    d: 'Menghapus proyek ini dari favorit.'
  },
  veResizePanel: {
    t: 'Ubah Lebar Panel',
    d: 'Seret untuk mengubah lebar panel. Klik ganda = reset ke lebar awal.'
  },
  setLang: {
    t: 'Bahasa Antarmuka',
    d: 'Bahasa untuk tab Pengaturan: Indonesia atau English.',
    w: 'Berlaku langsung dan diingat di browser lokal.'
  },
  /* ---- Kunci data-tip yang dipakai tapi belum ada di katalog ---- */
  veTextPanel: {
    t: 'Teks & Tipografi',
    d: 'Mengatur font, ukuran, dan gaya teks yang dipilih.'
  },
  layLock: {
    t: 'Kunci Layer',
    d: 'Mengunci layer ini agar tidak bisa dipilih atau diubah.'
  },
  layUnlock: {
    t: 'Buka Kunci Layer',
    d: 'Membuka kunci layer ini.'
  },
  layHide: {
    t: 'Sembunyikan Layer',
    d: 'Menyembunyikan layer ini dari kanvas.'
  },
  layShow: {
    t: 'Tampilkan Layer',
    d: 'Menampilkan kembali layer ini di kanvas.'
  },
  layEject: {
    t: 'Keluarkan dari Grup',
    d: 'Mengeluarkan layer ini dari grup/frame induknya.'
  },
  layEjectBucket: {
    t: 'Keluarkan Grup Warna',
    d: 'Mengeluarkan semua objek warna ini dari grupnya.'
  },
  layOpenFrame: {
    t: 'Buka Frame',
    d: 'Menampilkan isi frame/grup di daftar layer.'
  },
  layCloseFrame: {
    t: 'Tutup Frame',
    d: 'Menyembunyikan isi frame/grup di daftar layer.'
  },
  layFrameBg: {
    t: 'Latar Frame',
    d: 'Objek latar frame. Klik untuk memilihnya.'
  },
  layFrameLock: {
    t: 'Kunci Semua Isi',
    d: 'Mengunci semua objek di dalam grup/frame ini.'
  },
  layFrameUnlock: {
    t: 'Buka Kunci Semua Isi',
    d: 'Membuka kunci semua objek di dalam grup/frame ini.'
  },
  layFrameHide: {
    t: 'Sembunyikan Semua Isi',
    d: 'Menyembunyikan semua objek di dalam grup/frame ini.'
  },
  layFrameShow: {
    t: 'Tampilkan Semua Isi',
    d: 'Menampilkan semua objek di dalam grup/frame ini.'
  },
  uiClose: {
    t: 'Tutup',
    d: 'Menutup jendela ini.'
  },
  veShapePicker: {
    t: 'Pilih bentuk',
    d: 'Membuka daftar bentuk: persegi, lingkaran, segitiga, dan lainnya.'
  },
  wsCardMenu: {
    t: 'Menu tindakan proyek',
    d: 'Buka, ganti nama, duplikat, atau hapus proyek ini.'
  }
};
/* ---------- Overlay English untuk tooltip di tab Pengaturan ----------
   Hanya kunci yang dipakai di tab Pengaturan; kunci lain tetap memakai TIPS. */
const TIPS_EN = {
  setTheme: {
    t: 'Theme',
    d: 'Interface colors: follow system, light, or dark.'
  },
  setMotion: {
    t: 'Animation',
    d: 'Controls UI animation and transitions.',
    w: 'Turn off if you experience lag or prefer a calm interface.'
  },
  setTips: {
    t: 'Tooltips',
    d: 'Shows hints when hovering over a control.',
    w: 'Turn off once you are fluent with the app.'
  },
  setPersist: {
    t: 'Save preferences',
    d: 'Saves theme, animation, and UI preferences in the browser (localStorage).'
  },
  setReset: {
    t: 'Reset settings',
    d: 'Restores all app preferences to their defaults.'
  },
  setAbout: {
    t: 'About',
    d: 'App version and technical information.'
  },
  setTabUmum: {
    t: 'General tab',
    d: 'Interface theme, animation, tooltips, and preference storage.'
  },
  setTabKeys: {
    t: 'Shortcuts tab',
    d: 'Full list of all Vector Editor keyboard shortcuts.'
  },
  setLang: {
    t: 'Interface Language',
    d: 'Language for this Settings tab: Indonesian or English.',
    w: 'Applies immediately and is remembered in the local browser.'
  },
  closeDlg: {
    k: 'Esc',
    t: 'Close',
    d: 'Closes this panel.'
  },
  help: {
    k: '?',
    t: 'Keyboard shortcuts',
    d: 'Shows the list of all keyboard shortcuts.'
  },
  uiClose: {
    t: 'Close',
    d: 'Closes this window.'
  },
  veShapePicker: {
    t: 'Choose shape',
    d: 'Opens the shape list: rectangle, circle, triangle, and more.'
  },
  wsCardMenu: {
    t: 'Project actions menu',
    d: 'Open, rename, duplicate, or delete this project.'
  },
  cpHex: {
    t: 'Hex code',
    d: 'Type the 6-digit hex color (without #). Applied automatically when complete.'
  },
  cpHue: {
    t: 'Hue',
    d: 'Drag to pick the base color hue. Arrow keys shift by 1 degree.'
  },
  cpPipette: {
    t: 'Color pipette',
    d: 'Pick a color from anywhere on the screen. In browsers without a built-in pipette, it samples SVG elements, canvas, or images on the page. Esc to cancel.'
  },
  cpSV: {
    t: 'Saturation & brightness',
    d: 'Drag to set saturation (left to right) and brightness (bottom to top) of the color.'
  },
  layCloseFrame: {
    t: 'Close Frame',
    d: 'Hides the frame/group contents in the layer list.'
  },
  layEject: {
    t: 'Remove from Group',
    d: 'Removes this layer from its parent group/frame.'
  },
  layEjectBucket: {
    t: 'Remove Color Group',
    d: 'Removes all objects of this color from their group.'
  },
  layFrameBg: {
    t: 'Frame Background',
    d: 'Frame background object. Click to select it.'
  },
  layFrameHide: {
    t: 'Hide All Contents',
    d: 'Hides all objects inside this group/frame.'
  },
  layFrameLock: {
    t: 'Lock All Contents',
    d: 'Locks all objects inside this group/frame.'
  },
  layFrameShow: {
    t: 'Show All Contents',
    d: 'Shows all objects inside this group/frame.'
  },
  layFrameUnlock: {
    t: 'Unlock All Contents',
    d: 'Unlocks all objects inside this group/frame.'
  },
  layHide: {
    t: 'Hide Layer',
    d: 'Hides this layer from the canvas.'
  },
  layLock: {
    t: 'Lock Layer',
    d: 'Locks this layer so it cannot be selected or changed.'
  },
  layOpenFrame: {
    t: 'Open Frame',
    d: 'Shows the frame/group contents in the layer list.'
  },
  layShow: {
    t: 'Show Layer',
    d: 'Shows this layer on the canvas again.'
  },
  layUnlock: {
    t: 'Unlock Layer',
    d: 'Unlocks this layer.'
  },
  setTabTech: {
    t: 'Technology & architecture',
    d: 'List of libraries and browser APIs used.'
  },
  settings: {
    k: ',',
    t: 'Settings',
    d: 'Theme, animations, UI preferences, and app options.',
    w: 'Change the look or behavior of the app.'
  },
  veAddHandle: {
    t: 'Add Bézier Handle',
    d: 'Hover over a node (a ring and handle preview appear), then click to add a Bézier handle to that node. Handles follow the line direction around the node; drag after clicking to set their length and direction right away. Nodes that already have complete handles do not change.',
    w: 'Turning a straight corner into a curve, or adding a missing handle to a node at a path end.'
  },
  veAddNode: {
    t: 'Add Node',
    d: 'Hover over any object line, then click to add a node at that point. Drag after clicking to move it right away. Snaps to segment midpoints, grid lines, and other objects nodes and edges. Hold Alt to disable snapping.',
    w: 'When you need an extra node at a precise spot.'
  },
  veAhAddAll: {
    t: 'Add handles to all',
    d: 'Adds Bézier handles to all objects without changing their shape.'
  },
  veAhAddSel: {
    t: 'Add handles to selected',
    d: 'Adds Bézier handles to the selected object or nodes without changing their shape (handles placed at 1/3 and 2/3 of each segment).'
  },
  veAhAngle: {
    t: 'Skip sharp corners',
    d: 'Nodes whose included angle is smaller than this value are left untouched, so sharp corners stay sharp.'
  },
  veAhDelAll: {
    t: 'Delete all handles',
    d: 'Removes handles on all objects.'
  },
  veAhDelSel: {
    t: 'Delete selected handles',
    d: 'Removes handles on the selected object so its segments become straight lines.'
  },
  veAhScopeObj: {
    t: 'Scope: whole object',
    d: 'Clicking on the canvas affects all subpaths inside the clicked object.'
  },
  veAhScopeSub: {
    t: 'Scope: subpath',
    d: 'Clicking on the canvas only affects the clicked subpath.'
  },
  veAhTension: {
    t: 'Tension (τ)',
    d: 'Handle length relative to the distance between nodes. 0 = sharp corner, 0.33 = standard Hermite, 0.5 = very round.'
  },
  veAlAncCenter: {
    t: 'Center anchor',
    d: 'The alignment line passes through the center of all selected nodes.'
  },
  veAlAncFirst: {
    t: 'First node anchor',
    d: 'The first node in path order stays fixed; the other nodes adjust.'
  },
  veAlAncLast: {
    t: 'Last node anchor',
    d: 'The last node in path order stays fixed; the other nodes adjust.'
  },
  veAlAnchor: {
    t: 'Anchor point',
    d: 'Sets which point stays fixed as the pivot for line alignment.'
  },
  veAlAuto: {
    t: 'Auto',
    d: 'Finds the best straight line from the selected node positions, then automatically locks to horizontal/vertical when the slope is very small.',
    w: 'For a nearly straight line when you do not want to set the angle yourself.'
  },
  veAlCollapse: {
    t: 'Intermediate nodes',
    d: 'How middle nodes are treated when you select 3 or more nodes in sequence.'
  },
  veAlCustom: {
    t: 'Custom degrees',
    d: 'Aligns nodes following your chosen degree angle (slider or preset).'
  },
  veAlDeg: {
    t: 'Line angle (degrees)',
    d: 'Sets the slope of the target line from -180° to 180° (0° = horizontal, 90° = vertical). Changes apply immediately to the selected nodes.'
  },
  veAlKeep: {
    t: 'Keep',
    d: 'Nodes between the two ends stay and are flattened onto the target line together.'
  },
  veAlMerge: {
    t: 'Merge into 2 ends',
    d: 'Intermediate nodes are removed so the chain becomes one straight segment between the start and end nodes.',
    w: 'Reducing node count on sides that are already straight.'
  },
  veAlMode: {
    t: 'Parallel-angle mode',
    d: 'How the target line direction is determined when aligning 2 or more nodes.'
  },
  veAlPar: {
    t: 'Parallel to opposite side (∥)',
    d: 'Aligns nodes to be parallel with the segment on the opposite side of the same subpath (needs at least 4 nodes).'
  },
  veAlPerp: {
    t: 'Perpendicular (⊥ 90°)',
    d: 'Aligns nodes so they are perpendicular (90°) to the average direction of the stems/sides on their left and right.',
    w: 'Tidying the ends of slanted line cuts or letter legs.'
  },
  veAlPreset: {
    t: 'Quick degree preset',
    d: 'Click to align the selected nodes to this standard angle right away.'
  },
  veAlSlide: {
    t: 'How end nodes slide',
    d: 'Sets the path end nodes follow while being flattened.'
  },
  veAlSlideOff: {
    t: 'Perpendicular projection',
    d: 'Nodes are dropped straight down (perpendicular) onto the target line.'
  },
  veAlSlideOn: {
    t: 'Follow side rail (Edge-Sliding)',
    d: 'End nodes slide along the extension of the neighboring side line, so the thickness and slope of the adjacent stem do not change.',
    w: 'Flattening the end of a ribbon, slanted bar, or letter leg.'
  },
  veAlignSel: {
    t: 'Straighten selected',
    d: 'Aligns the selected nodes or Bézier handles onto one straight line. Nearly horizontal/vertical lines snap to the axis, and segments between selected nodes become straight lines.',
    w: 'A wobbly rectangle bottom edge: select the two bottom nodes (or their handles), then click.'
  },
  veAlnBottom: {
    t: 'Align bottom',
    d: 'Moves objects (or nodes) so their bottom edge lines up with the bottom edge of the reference.'
  },
  veAlnDistH: {
    t: 'Distribute horizontally',
    d: 'Makes the empty gaps between objects equal from left to right. The leftmost and rightmost objects stay in place.',
    w: 'Needs at least 3 objects.'
  },
  veAlnDistV: {
    t: 'Distribute vertically',
    d: 'Makes the empty gaps between objects equal from top to bottom. The topmost and bottommost objects stay in place.',
    w: 'Needs at least 3 objects.'
  },
  veAlnHC: {
    t: 'Align center horizontally',
    d: 'Aligns the horizontal center point with the center of the reference.'
  },
  veAlnLeft: {
    t: 'Align left',
    d: 'Moves objects (or nodes) so their left edge lines up with the left edge of the reference.'
  },
  veAlnPanel: {
    t: 'Alignment & Distribution',
    d: 'Aligns and distributes objects. One object aligns to the Artboard, two or more to the selection bounding box, and two or more nodes to the node bounding box.'
  },
  veAlnRight: {
    t: 'Align right',
    d: 'Moves objects (or nodes) so their right edge lines up with the right edge of the reference.'
  },
  veAlnTop: {
    t: 'Align top',
    d: 'Moves objects (or nodes) so their top edge lines up with the top edge of the reference.'
  },
  veAlnVC: {
    t: 'Align center vertically',
    d: 'Aligns the vertical center point with the center of the reference.'
  },
  veAlphaPct: {
    t: 'Opacity (%)',
    d: 'Color transparency level in percent.'
  },
  veAngTol: {
    t: 'Direction tolerance',
    d: 'Maximum angle between segments that are still merged when straightening.'
  },
  veAnomFilter: {
    t: 'Anomaly category',
    d: 'Filters the list and canvas markers: Corners (stacked nodes), Collinear (redundant nodes), Wobbly (wavy lines), Facet (broken curves), Arc (overly dense arcs).'
  },
  veAnomList: {
    t: 'Anomaly list',
    d: 'Geometry anomalies found on the path, matching the selected category.'
  },
  veAppear: {
    t: 'Appearance',
    d: 'Appearance properties of the selected object. When several objects are selected, changes apply to all of them.'
  },
  veApplyCorner: {
    t: 'Apply smooth corner',
    d: 'Replaces the selected corner nodes with two smooth nodes (fillet).'
  },
  veApplySimplify: {
    t: 'Apply Simplify',
    d: 'Commits the Simplify result to the path as a single Undo step.'
  },
  veBoolUnion: {
    k: 'Ctrl+Alt+U',
    t: 'Boolean Union',
    d: 'Merges 2+ selected closed path objects into one shape (Object › Path › Union). Open subpaths are skipped.',
    w: 'The result uses the bottom object’s fill and the evenodd fill rule.'
  },
  veBoolSubtract: {
    k: 'Ctrl+Alt+S',
    t: 'Boolean Subtract',
    d: 'Cuts the selected shapes with the topmost (front) object as the cutter (Object › Path › Subtract).',
    w: 'The topmost object is removed; the rest become one shape.'
  },
  veBoolIntersect: {
    k: 'Ctrl+Alt+I',
    t: 'Boolean Intersect',
    d: 'Keeps only the overlapping region of all selected closed path objects (Object › Path › Intersect).'
  },
  veBoolExclude: {
    k: 'Ctrl+Alt+X',
    t: 'Boolean Exclude (XOR)',
    d: 'Keeps only regions owned by exactly one object — overlapping regions are removed (Object › Path › Exclude).'
  },
  veOutlineStroke: {
    k: 'Ctrl+Alt+O',
    t: 'Outline Stroke',
    d: 'Converts the stroke of the selected objects into a filled shape (fill = stroke color, stroke removed). The old fill is discarded. Essential for logos, print, and laser cutting.'
  },
  veOffsetPath: {
    t: 'Offset Path',
    d: 'Expands (+) or contracts (−) the selected path by a given distance, with a live preview. Miter/Bevel/Round joins; a path that shrinks away entirely is left unchanged.'
  },
  veOffsetDist: {
    t: 'Offset Distance (pt)',
    d: 'Expansion (+) or contraction (−) distance of the path, −100 to +100 pt. The preview updates live on the canvas.'
  },
  veOffsetJoin: {
    t: 'Offset Join',
    d: 'Corner shape of the offset path: Miter (sharp), Bevel (cut), or Round.'
  },
  veOffsetBadge: {
    t: 'Offset & Anchor Points',
    d: 'Current offset distance and anchor point count before → after the offset.'
  },
  veOffsetApply: {
    t: 'Apply Offset',
    d: 'Commits the Offset result to the path as a single Undo step.'
  },
  veOffsetCancel: {
    t: 'Cancel Offset',
    d: 'Cancels the Offset and restores the path as it was.'
  },
  veApplyStraight: {
    t: 'Apply straightening',
    d: 'Aligns the selected nodes or handles per the settings above. With no nodes selected, straightens the whole path using the threshold below.'
  },
  veArea: {
    t: 'Export area',
    d: 'Artboard: only the frame area (original viewBox). All content: a tight box around every object on the canvas, including those outside the artboard.'
  },
  veAreaAll: {
    t: 'All content',
    d: 'Exports a tight box around all objects on the canvas, including those outside the artboard.'
  },
  veAreaBoard: {
    t: 'Artboard',
    d: 'Exports only the frame area (original viewBox).'
  },
  veAreaSel: {
    t: 'Selected objects',
    d: 'Exports only the currently selected objects, cropped tight to their bounds. Other objects are excluded. Select objects first before copying or downloading.',
    w: 'Grabbing one piece or one icon from a large design.'
  },
  veAutoHandle: {
    k: 'B',
    t: 'Auto Bézier Handle',
    d: 'Click a node (or an object body) to give ALL nodes on that subpath smooth Bézier handles (Centripetal Catmull-Rom, no folds). Drag left/right after clicking to adjust tension live.',
    w: 'Turning a jagged polygon into a smooth curve at once.'
  },
  veAutoRefine: {
    t: 'Auto Tidy',
    d: 'Straightens wobbly segments / wavy node chains, then rounds jagged corners on the selected objects, in one click. Uses the Deviation threshold below. Shared borders with other objects are preserved so no gaps appear.',
    w: 'To tidy the sides and corners of selected objects at once.'
  },
  veBackWorkspace: {
    t: 'Back to Workspace',
    d: 'Returns to the project list. The project saves automatically.'
  },
  veBevelDeg: {
    t: 'Opening angle preset',
    d: 'Sets the proportion of the corner cut distance per the opening angle (Auto = follows the original geometry angle).'
  },
  veBg: {
    t: 'Canvas background',
    d: 'Transparent: the canvas shows a checker pattern and SVG export has no background. Solid: the canvas is filled with the chosen color and SVG export includes a colored background rectangle.'
  },
  veBgColor: {
    t: 'Background color',
    d: 'Background color in Solid mode.'
  },
  veBgSolid: {
    t: 'Solid',
    d: 'Plain colored background.'
  },
  veBgTr: {
    t: 'Transparent',
    d: 'No background (checker pattern).'
  },
  veClearSearch: {
    t: 'Clear Search',
    d: 'Clears the search text.'
  },
  veClipFrames: {
    t: 'Clip Frame',
    d: 'Clips the display of objects that cross the Frame boundary, like Clip Content in Figma.'
  },
  veClose: {
    t: 'Close path',
    d: 'Closes the selected path (adds a closing segment to the start point).'
  },
  veColorText: {
    t: 'Color value',
    d: 'Type a CSS color: hex (#e11d48), name (red), rgb() or hsl(). Press Enter to apply, Esc to cancel.'
  },
  veCopy: {
    t: 'Copy (selected format)',
    d: 'SVG/AI/EPS/PS are copied as text; PNG/JPG/WEBP as a PNG image. Ctrl+C on objects copies the SVG code + PNG image together.'
  },
  veCorner: {
    t: 'Smooth Corner',
    d: 'Circular fillet on the selected corner nodes. Select nodes first, set a radius, then apply.'
  },
  veCornerChamfer: {
    t: 'Bevel (Chamfer)',
    d: 'Cuts a sharp corner into a straight slanted line (no handle curve).'
  },
  veCornerCirc: {
    t: 'Circular',
    d: 'Corners are rounded with a precise circle arc.'
  },
  veCornerMode: {
    t: 'Corner profile',
    d: 'Circular = precise circle arc. Squircle = longer Bézier handles for a softer transition. Bevel = the corner is cut into a straight slanted line (chamfer).'
  },
  veCornerR: {
    t: 'Corner radius',
    d: 'Circular fillet radius applied to corner nodes.'
  },
  veCornerRadius: {
    t: 'Corner radius',
    d: 'Rounds all sharp corners on the selected object with a circular fillet. Drag to change the radius any time; 0 restores sharp corners. Only corners between two straight segments are rounded, and the radius is limited to 45% of the segment length.'
  },
  veCornerSm: {
    t: 'Smoothness',
    d: 'Handle length relative to the tangent-point distance (smooth Bézier mode only).'
  },
  veCornerSq: {
    t: 'Squircle',
    d: 'Corners are rounded with longer Bézier handles for a softer transition. Adjust with the Smoothness slider.'
  },
  veCtxFlatten: {
    k: 'Ctrl + E',
    t: 'Flatten',
    d: 'Merges 2 or more objects into one path (attributes follow the topmost object). With only one object inside a group, the object is released from its group.'
  },
  veCtxGroup: {
    k: 'Ctrl + G',
    t: 'Group',
    d: 'Groups 2 or more objects so they are selected and move together. Pressing Ctrl+G on a whole group still releases it (compatible with the old version).'
  },
  veCtxUngroup: {
    k: 'Ctrl + Shift + G',
    t: 'Ungroup',
    d: 'Releases a group or Frame from the selected objects: all children are moved to the canvas and stay selected (the Frame background box is removed too). Selecting only some members still releases the parent.',
    w: 'To edit one object inside a group without changing the others.'
  },
  veCurAngle: {
    t: 'Current line angle',
    d: 'Slope of the line between the first and last selected nodes (0° = horizontal, 90° = vertical).'
  },
  veCurveDrag: {
    t: 'Curved Handle Drag Mode',
    d: 'When on, dragging a Bézier handle in No Mirroring mode automatically forms a smooth arc (sets the segment curvature independently without rotating the handle on the other side of the node).',
    w: 'Turn on in the floating toolbar when you want to freely pull a straight line/handle into a curve.'
  },
  veDelNode: {
    k: 'Delete',
    t: 'Delete node',
    d: 'Deletes the currently selected node from the path.'
  },
  veDelObj: {
    k: 'Delete',
    t: 'Delete',
    d: 'Deletes the selected nodes; if no nodes are selected, deletes the selected objects.'
  },
  veDown: {
    k: '[',
    t: 'Send backward',
    d: 'Moves the selected objects one step backward.'
  },
  veDownload: {
    t: 'Download (selected format)',
    d: 'Downloads the edited result as .svg, .png, .jpg, .webp, .ai, .eps or .ps (Ctrl+S).'
  },
  veDup: {
    k: 'Ctrl + D',
    t: 'Duplicate',
    d: 'Duplicates the selected objects (shifted 10 units).'
  },
  veExpFmt: {
    t: 'Export & copy format',
    d: 'Choose the file format: pure vector (SVG, AI, EPS, PS) or raster image (PNG, JPG, WEBP).'
  },
  veExpS_1: {
    t: '1x',
    d: 'Original size per the viewBox; smallest file.'
  },
  veExpS_2: {
    t: '2x (HD)',
    d: 'Double resolution; good for retina screens and the web.'
  },
  veExpS_4: {
    t: '4x (Ultra)',
    d: 'Four times the resolution; large files and slower to process.',
    w: 'For print or images that will be enlarged.'
  },
  veExpScale: {
    t: 'Raster resolution scale',
    d: 'Resolution multiplier when exporting to PNG, JPG, or WEBP. 2x and 4x produce much sharper images (supersampling).'
  },
  veExp_ai: {
    t: 'Adobe Illustrator (.AI)',
    d: 'PDF-1.4 file with an .ai extension plus Geovanta round-trip data for lossless reopening here.'
  },
  veExp_eps: {
    t: 'EPS (PostScript)',
    d: 'PostScript EPSF-3.0 for print workflows and legacy design apps.'
  },
  veExp_jpg: {
    t: 'JPG',
    d: 'Compressed raster image without transparency; background automatically white (or the solid background color).'
  },
  veExp_png: {
    t: 'PNG',
    d: 'Raster image with transparency. Choose the resolution scale below.'
  },
  veExp_svg: {
    t: 'SVG',
    d: 'Pure SVG vector; stays sharp at every scale and can be reopened here without data loss.'
  },
  veExp_webp: {
    t: 'WEBP',
    d: 'Modern small raster image with transparency support.'
  },
  veFavAdd: {
    t: 'Add to Favorites',
    d: 'Marks this project as a favorite.'
  },
  veFavRemove: {
    t: 'Remove from Favorites',
    d: 'Removes this project from favorites.'
  },
  veFill: {
    t: 'Fill',
    d: 'Fill color of the selected path.'
  },
  veFillEvenodd: {
    t: 'Even-odd',
    d: 'Areas enclosed by an odd number of contours are filled, even ones become holes, regardless of path direction.',
    w: 'Letters, rings, or shapes with holes that do not show up.'
  },
  veFillNone: {
    t: 'Empty fill',
    d: 'Turns the object fill color on/off.'
  },
  veFillNonzero: {
    t: 'Nonzero',
    d: 'Every area inside the contour is filled, depending on the path drawing direction.',
    w: 'Ordinary shapes without holes, or holes whose direction is already correct.'
  },
  veFillRule: {
    t: 'Fill rule',
    d: 'Rule that decides which areas are filled when paths overlap or have holes.'
  },
  veFontRemove: {
    t: 'Remove Font from List',
    d: 'Removes the font from the list. Text objects stay safe.'
  },
  veFontSearchReset: {
    t: 'Reset Font Search',
    d: 'Clears the font search text.'
  },
  veFontSizeDown: {
    t: 'Decrease Text Size',
    d: 'Makes the text smaller.'
  },
  veFontSizeUp: {
    t: 'Increase Text Size',
    d: 'Makes the text larger.'
  },
  veFrameAuto: {
    t: 'Frame → Auto Layout',
    d: 'Turns the Frame of the selected objects into an Auto Layout. Direction (row/column/wrap), gap and padding are inferred from the current object positions so nothing jumps.'
  },
  veFrameTool: {
    t: 'Frame',
    d: 'Drag on the canvas to draw a Frame; objects whose center falls inside the area automatically join the Frame. Single click: wraps the selected objects in a Frame (or creates an empty Frame when nothing is selected).',
    w: 'Making a Figma-style container/artboard that can be used for Auto Layout.'
  },
  veGradAngle: {
    t: 'Gradient angle',
    d: 'Direction of the linear gradient in degrees (-180° to 180°).'
  },
  veGradAnglePreset: {
    t: 'Quick angle',
    d: 'Sets the gradient angle to this value right away.'
  },
  veGradBar: {
    t: 'Gradient bar',
    d: 'Click on the bar to add a new color stop; drag a stop to move it.'
  },
  veGradDelStop: {
    t: 'Delete stop',
    d: 'Deletes the currently selected stop (a gradient needs at least 2 stops).'
  },
  veGradDistribute: {
    t: 'Even out stops',
    d: 'Spreads all stops at equal distances from 0% to 100%.'
  },
  veGradInterp: {
    t: 'Interpolation space',
    d: 'How colors are blended between stops. OKLab gives smoother, more natural transitions; sRGB follows standard SVG behavior.'
  },
  veGradLinear: {
    t: 'Linear',
    d: 'Straight gradient from one point to another, with an adjustable angle.'
  },
  veGradMid: {
    t: 'Midpoint',
    d: 'Sets where the blend of two stops sits at 50%. Drag to shift, double-click to reset to 50%.'
  },
  veGradMode: {
    t: 'Fill Mode',
    d: 'Object fill type: solid color, linear gradient, radial gradient, or no fill.'
  },
  veGradNone: {
    t: 'Empty',
    d: 'The object has no fill (stroke only).'
  },
  veGradOk: {
    t: 'Smooth OKLab',
    d: 'Color blending in OKLab space: no muddy band in the middle of the transition.'
  },
  veGradPad: {
    t: 'Pad',
    d: 'The first and last stop colors are extended outward.'
  },
  veGradRadial: {
    t: 'Radial',
    d: 'Circular gradient radiating from the center to the edge.'
  },
  veGradRdp: {
    t: 'Simplify stops (RDP)',
    d: 'Removes excess stops on the gradient using the Ramer–Douglas–Peucker algorithm, without changing the look much.'
  },
  veGradReflect: {
    t: 'Reflect',
    d: 'The gradient is mirrored back and forth outside its bounds.'
  },
  veGradRepeat: {
    t: 'Repeat',
    d: 'The gradient repeats from the start outside its bounds.'
  },
  veGradReverse: {
    t: 'Reverse gradient',
    d: 'Reverses the order of all stops (start becomes end).'
  },
  veGradSolid: {
    t: 'Solid',
    d: 'Fills the object with a single flat color.'
  },
  veGradSpread: {
    t: 'Spread method',
    d: 'Gradient behavior outside its start and end points.'
  },
  veGradSrgb: {
    t: 'sRGB',
    d: 'Standard sRGB color blending, matching SVG rendering in every app.'
  },
  veGradStop: {
    t: 'Color stop',
    d: 'Click to select a stop, drag to move its position along the gradient.'
  },
  veGradStopColor: {
    t: 'Stop color',
    d: 'Changes the color of the currently selected stop.'
  },
  veGradStopOp: {
    t: 'Stop opacity',
    d: 'Color transparency at this stop; 0% clear, 100% opaque.'
  },
  veGradStopPos: {
    t: 'Stop position',
    d: 'Position of the stop along the gradient, 0% at the start to 100% at the end.'
  },
  veGrid: {
    t: 'Grid',
    d: 'Shows the grid as a guide and snap target. Grid size adapts to zoom automatically (multiples of 10 units) so lines stay readable at any zoom.'
  },
  veHand: {
    k: 'H | Spasi',
    t: 'Pan',
    d: 'Drag the canvas to pan the view. The middle mouse button works in other tools too.'
  },
  veImport: {
    t: 'Import SVG / AI / EPS / image',
    d: 'Adds one or many files to the canvas: SVG, AI, EPS, PS, PDF (become editable vector objects) or PNG/JPG/WebP/GIF images. File type is detected from content (magic byte). Files are added at the center of the view and do not replace the canvas content. You can also drag-drop files onto the canvas or paste with Ctrl+V.'
  },
  veInsert: {
    t: 'Insert node',
    d: 'Adds a node in the middle of the segment between two adjacent selected nodes. Or double-click on the path line.'
  },
  veLayAlign: {
    t: '9-point alignment',
    d: 'Sets the position of objects inside their row or column when sizes differ: left/center/right and top/middle/bottom.'
  },
  veLayApply: {
    t: 'Apply Auto Layout',
    d: 'Arranges the selected objects per the settings above. After that, changing gap, padding, direction, or alignment re-arranges immediately while the same selection stays active.'
  },
  veLayArtboard: {
    t: 'Padding to Artboard',
    d: 'Resizes the Artboard (viewBox) to surround the selected objects, or all content when nothing is selected, with the 4-side padding above.',
    w: 'Tidying empty space before export.'
  },
  veLayBucket: {
    t: 'Merge Colors',
    d: 'Same-colored objects inside one Frame/Group are merged into one row. Click that row to select them all, then change fill, stroke, and radius at once.'
  },
  veLayCol: {
    t: 'Column (↓)',
    d: 'All objects are arranged downward from top to bottom.'
  },
  veLayCols: {
    t: 'Columns per row',
    d: 'Maximum number of objects in one row in Grid mode.'
  },
  veLayDir: {
    t: 'Layout direction',
    d: 'Sets how objects are arranged.'
  },
  veLayFrame: {
    t: 'Background frame',
    d: 'Creates an automatic background rectangle behind the objects, as wide as the content plus padding. Turning it off deletes that automatic frame.',
    w: 'Cards, buttons, or icon groups that need a background.'
  },
  veLayGap: {
    t: 'Gap between objects',
    d: 'Empty distance between adjacent objects.'
  },
  veLayPad: {
    t: 'Padding',
    d: 'Empty distance between the frame and the objects inside it. Symmetric mode uses one value for all four sides.'
  },
  veLayPadB: {
    t: 'Bottom padding (B)',
    d: 'Distance from the frame to the bottommost object.'
  },
  veLayPadL: {
    t: 'Left padding (L)',
    d: 'Distance from the frame to the leftmost object.'
  },
  veLayPadMode: {
    t: 'Padding mode',
    d: 'Symmetric = one value for all sides. 4 sides = set top, right, bottom, and left individually.'
  },
  veLayPadR: {
    t: 'Right padding (R)',
    d: 'Distance from the frame to the rightmost object.'
  },
  veLayPadT: {
    t: 'Top padding (T)',
    d: 'Distance from the frame to the topmost object.'
  },
  veLayPanel: {
    t: 'Auto Layout & Padding',
    d: 'Arranges selected objects in rows, columns, or a grid with gaps, alignment, 4-side padding, and an automatic background frame. After applying, changing the controls here re-arranges immediately.'
  },
  veLayRadius: {
    t: 'Frame radius',
    d: 'Roundness of the automatic background frame corners.'
  },
  veLayRow: {
    t: 'Row (→)',
    d: 'All objects are arranged horizontally from left to right.'
  },
  veLayWrap: {
    t: 'Grid (⊞)',
    d: 'Objects are arranged horizontally then wrap to the next row each time the column count is reached.'
  },
  veLayer: {
    t: 'Layer',
    d: 'Click to select the object. Shift for multi-select.'
  },
  veLayerImage: {
    t: 'Image Object',
    d: 'This layer is an image object.'
  },
  veLayerShape: {
    t: 'SVG Shape Preview',
    d: 'This layer is an SVG shape.'
  },
  veLayerText: {
    t: 'SVG Text Object',
    d: 'This layer is an SVG text object.'
  },
  veLayers: {
    t: 'Layer list',
    d: 'Objects are ordered front-most on top. Click to select, Shift or Ctrl for multi-select.'
  },
  veMaxDev: {
    t: 'Deviation threshold',
    d: 'Maximum deviation (units) for a node chain to be considered a straight line.'
  },
  veMirror: {
    t: 'Handle Mirroring',
    d: 'Sets how Bézier handles pair up on the selected node/handle, like the Mirroring panel in Figma. Select a node (or handle) first. Hold Alt while dragging a handle to break mirroring temporarily (node becomes No mirroring).',
    w: 'The mode applies live while dragging a handle, not only when selected.'
  },
  veMirrorAL: {
    t: 'Mirror angle and length',
    d: 'Both handles collinear AND equal in length. Moving one handle fully mirrors its position to the opposite handle (symmetric around the node).',
    w: 'Perfectly symmetric curve around the node.'
  },
  veMirrorAngle: {
    t: 'Mirror angle',
    d: 'Both handles always collinear (opposite directions). Rotating one handle rotates the opposite handle, but their lengths stay different and free.',
    w: 'Smooth curve (G1) with unequal handle lengths.'
  },
  veMirrorCurve: {
    t: 'No mirroring (Curved Drag)',
    d: 'Both handles free & independent (no mirroring), but Bézier handles appear automatically and segments curve dynamically as either handle is dragged.',
    w: 'When you want to drag 1 handle independently into a smooth curved shape.'
  },
  veMirrorNone: {
    t: 'No mirroring',
    d: 'Both handles fully independent: each direction and length is free. Moving one handle does not move the opposite handle.',
    w: 'Making a sharp corner or an asymmetric curve.'
  },
  veNoColor: {
    t: 'Remove Color (No Color)',
    d: 'Removes the color / sets it to None (fully transparent).'
  },
  veNode: {
    k: 'A | N',
    t: 'Edit Node',
    d: 'Show and edit nodes and Bézier handles. Drag a node or handle to change the path shape.'
  },
  veOpacity: {
    t: 'Opacity',
    d: 'Transparency of the selected path (0–100%).'
  },
  veOpen: {
    t: 'Open path',
    d: 'Opens a closed path (removes the Z closing).'
  },
  vePen: {
    k: 'P',
    t: 'Pen Tool',
    d: 'Click = corner node (straight). Click-hold-drag (> 4 px) = smooth node with symmetric handles. Alt while dragging = break the corner (incoming handle locked). Shift = lock to 45°. Click the first node to close the path; Enter / Esc / double-click to finish; Backspace deletes the last node. Multi-guide snapping is active.',
    w: 'Drawing precise Bézier curves from scratch.'
  },
  vePenFill: {
    t: 'With fill',
    d: 'The drawn path gets a fill color.'
  },
  vePenFinish: {
    k: 'Enter',
    t: 'Finish drawing',
    d: 'Ends the path being drawn.'
  },
  vePenNoFill: {
    t: 'No fill',
    d: 'The drawn path is only a line (stroke), with no fill color.'
  },
  vePipetteFill: {
    t: 'Fill Color Pipette',
    d: 'Samples a color from the canvas for fill.'
  },
  vePipetteStroke: {
    t: 'Stroke Color Pipette',
    d: 'Samples a color from the canvas for stroke.'
  },
  vePixelMode: {
    t: 'Pixel Mode',
    d: 'Turns pixel mode on/off on the canvas.'
  },
  vePruneAng: {
    t: 'Minimum angle',
    d: 'Turns below this value are not treated as corners, so their nodes may be deleted.',
    w: 'Lower it if blunt corners disappear too; raise it if noise nodes remain.'
  },
  vePruneNodes: {
    t: 'Delete Non-Corner Nodes',
    d: 'Detects sharp corners (sudden turns whose original contour hugs the intersection of both sides), locks the nodes at those corners, then deletes all nodes in the middle/edges of sides between two corners as long as the deviation from the original contour stays within tolerance. Curved sides are replaced by 1 Bézier curve when it still fits. Nodes on shared borders between objects are untouched.',
    w: 'Good for tidying paths with excess nodes, e.g. the letter A from 58 nodes down to exactly its corners.'
  },
  vePruneTol: {
    t: 'Node deletion tolerance',
    d: 'Maximum deviation of the result from the original contour. Small = safe but more nodes remain; large = more aggressive.',
    w: 'Start at 0.75; raise it if middle nodes still remain.'
  },
  vePxCoverage: {
    t: 'Mode 2 — Pixel Coverage Preview',
    d: 'Shows the antialiasing coverage level of each pixel.'
  },
  vePxHard: {
    t: 'Mode 3 — Hard Pixel Preview',
    d: 'Per-object binary rasterizer, box pixel colors 100% solid and crisp with no blended/transparent colors at the edges.'
  },
  vePxSmooth: {
    t: 'Mode 1 — Smooth Vector (Default)',
    d: 'Vector contours stay smooth and solid without pixel boxes at the edges.'
  },
  veRadiusPreset: {
    t: 'Quick radius preset',
    d: 'Click to apply this radius size to the selected corners right away (Sharp = back to 0).'
  },
  veRangeScrub: {
    t: 'Drag Value',
    d: 'Drag left/right to change the value.'
  },
  veRangeType: {
    t: 'Type Number',
    d: 'Click to type a number directly.'
  },
  veRedo: {
    k: 'Ctrl + Y',
    t: 'Redo',
    d: 'Redoes the change that was undone.'
  },
  veRenameProject: {
    t: 'Rename Project',
    d: 'Click to rename the project.'
  },
  veResizePanel: {
    t: 'Resize Panel Width',
    d: 'Drag to change the panel width. Double-click = reset to the initial width.'
  },
  veSaveError: {
    t: 'Save Failed',
    d: 'Click to try saving again.'
  },
  veSaveOk: {
    t: 'Save Status',
    d: 'Local project save status (IndexedDB).'
  },
  veSelColor: {
    t: 'Change color',
    d: 'Changes this color on all objects using it at once.'
  },
  veSelPick: {
    t: 'Select objects with this color',
    d: 'Selects only the objects using this color, to set their radius or stroke at once.'
  },
  veSelect: {
    k: 'V',
    t: 'Select',
    d: 'Select objects or nodes. Shift for multi-select. Drag an object to move it.'
  },
  veShape: {
    t: 'Shape',
    d: 'Pick a basic shape (rectangle, circle, star, arrow, heart, etc.), then drag on the canvas to draw. Single click for the default size. Shift = proportional.',
    w: 'Adds a new shape to the canvas as a path whose nodes can be edited.'
  },
  veShapeItem: {
    t: 'Shape',
    d: 'Drag on the canvas to draw, or single-click for the default size. Hold Shift for a 1:1 proportion.'
  },
  veSharpen: {
    t: 'Sharpen corner',
    d: 'Melts a blunt/rounded corner (two nearby nodes, e.g. from import or an old fillet) into one sharp corner at the intersection of its tangent lines. With no nodes selected: automatic detection across the selected objects. With nodes selected: two adjacent nodes are merged; a single node becomes a corner without handles.'
  },
  veShowHandleGlobal: {
    t: 'Show Bézier Handles (Global)',
    d: 'Shows or hides Bézier handles on every selected object. The setting applies globally to all object selections and also works in Select mode.'
  },
  veShowNodeGlobal: {
    t: 'Show Nodes (Global)',
    d: 'Shows or hides nodes on every selected object. The setting applies globally to all object selections and also works in Select mode.'
  },
  veSidebarHide: {
    t: 'Hide Layer Panel',
    d: 'Hides the layer panel on the left side.'
  },
  veSidebarShow: {
    t: 'Show Layer Panel',
    d: 'Shows the layer panel on the left side.'
  },
  veSimpBadge: {
    t: 'Anchor Points',
    d: 'Number of anchor points before and after simplify.'
  },
  veSimpCancel: {
    k: 'Esc',
    t: 'Cancel Simplify',
    d: 'Cancels simplify without applying changes.'
  },
  veSimplify: {
    k: 'S',
    t: 'Simplify',
    d: 'Simplifies Bézier curve paths with the VectorCraft least-squares cubic fitting algorithm (Object › Path › Simplify).',
    w: 'Reduces anchor points while keeping shape precision and corners.'
  },
  veSimplifyAngle: {
    t: 'Corner Point Angle Threshold',
    d: 'Angles below this threshold (0°–180°, default 150° → turns > 30°) are kept as sharp corners.'
  },
  veSimplifyAuto: {
    t: 'Auto-Simplify',
    d: 'Sets the automatic Simplify level from the selected object size (size / 400).'
  },
  veSimplifyLevel: {
    t: 'Simplify Slider (0–100)',
    d: 'Left (0) = fewest anchor points (32 pt); Middle (50) = 1 pt; Right (100) = closest to the original path (1/32 pt).'
  },
  veSimplifyMore: {
    t: 'More Options…',
    d: 'Opens the full Simplify dialog (Tolerance, Corner Point Angle Threshold, Convert to Straight Lines, Show Original Path).'
  },
  veSimplifyOrig: {
    t: 'Show Original Path',
    d: 'Shows the original path outline under the canvas preview before Simplify.'
  },
  veSimplifyRetain: {
    t: 'Open this dialog with these settings next time',
    d: 'Opens the full Simplify dialog with these settings on the next call.'
  },
  veSimplifyStraight: {
    t: 'Convert to Straight Lines',
    d: 'Produces straight line segments only, using Ramer–Douglas–Peucker (RDP) polyline reduction.'
  },
  veSimplifyTol: {
    t: 'Tolerance (pt)',
    d: 'Maximum deviation distance (document points) between the original path and the Simplify result (0.001–10000 pt).'
  },
  veSmoothTb: {
    t: 'Smooth nodes (Taubin)',
    d: 'Evens out the selected node positions without shrinking the shape (Taubin λ|μ filter), then recalculates smooth (G1) Bézier handles.'
  },
  veSnap: {
    t: 'Snap',
    d: 'Figma-style multi-snap: click the small arrow beside it to pick features (Smart Guides box/center, Equal Spacing, Artboard, Node & Handle, Node X/Y axes, Midpoint, Contour, 90°/extension, Grid, Pixel). X and Y axes snap independently. While dragging, nodes and Bézier handles snap to other objects nodes/handles (red circle), to other objects edges/contours (green diamond), then to the grid. A dragged handle point also snaps to other Bézier handle lines (orange diamond). 8 screen-pixel tolerance. Hold Alt to disable temporarily.'
  },
  veSnapMenu: {
    t: 'Snap features checklist',
    d: 'Choose which snap targets are active while moving objects, nodes, or handles.',
    w: 'Turn off certain options if the cursor sticks too often in dense areas.'
  },
  veSnapPresetAll: {
    t: 'Enable all',
    d: 'Enables every snap target from Smart Guides to Grid for maximum precision. Pixel rounding is unchanged.'
  },
  veSnapPresetDef: {
    t: 'Default preset',
    d: 'Restores the checklist to defaults: all smart guides and grid on, no pixel rounding.'
  },
  veSnapPresetMin: {
    t: 'Minimal mode',
    d: 'Only snaps to node & handle points; box guides, spacing, and other targets are off.',
    w: 'When other snaps feel distracting and you only need to lock onto nodes.'
  },
  veSnap_artboard: {
    t: 'Artboard Edges & Center',
    d: 'Snaps to the edge bounds and the horizontal and vertical center lines of the canvas (viewBox).'
  },
  veSnap_axial: {
    t: 'Node Axis Alignment (X/Y)',
    d: 'Shows guide lines when the X or Y position lines up straight with another node or the base of its own handle.'
  },
  veSnap_bbox: {
    t: 'Smart Guides (Box & Center)',
    d: 'Snaps to the left, right, top, bottom edges and center point of other objects bounding boxes.'
  },
  veSnap_edge: {
    t: 'Contour / Path Edge',
    d: 'Snaps a node or object so it exactly touches the outline (contour) of another object.'
  },
  veSnap_grid: {
    t: 'Adaptive Grid Lines',
    d: 'Snaps to grid intersections and lines. Requires the Grid button in the toolbar to be on.'
  },
  veSnap_midpoint: {
    t: 'Segment Midpoint',
    d: 'Snaps to the midpoint of every straight or Bézier curve segment.'
  },
  veSnap_node: {
    t: 'Node & Handle Points',
    d: 'Snaps directly (2D lock) to node points or Bézier handle ends of other objects.'
  },
  veSnap_perp: {
    t: 'Right Angle (90°) & Line Extension',
    d: 'Locks node movement to a right angle (90°) or the straight extension of a neighboring segment.'
  },
  veSnap_pixel: {
    t: 'Round to Pixel (1 px)',
    d: 'Rounds final coordinates to the nearest whole number for crisp results on low-resolution screens.'
  },
  veSnap_spacing: {
    t: 'Equal Spacing',
    d: 'Detects and locks exactly equal empty gaps between 3 or more aligned objects.'
  },
  veStats: {
    t: 'Document statistics',
    d: 'Object count, total nodes, and the currently selected objects or nodes.'
  },
  veStorageInfo: {
    t: 'Local Storage Information',
    d: 'Shows local storage (IndexedDB) usage.'
  },
  veStraight: {
    t: 'Straighten',
    d: 'Line-straightening panel: tidies nearly-straight segments on the selected path.',
    w: 'To tidy the sides of a logo or geometric shape.'
  },
  veStroke: {
    t: 'Stroke',
    d: 'Outline color of the selected path.'
  },
  veStrokeNone: {
    t: 'Empty stroke',
    d: 'Turns the object outline on/off.'
  },
  veStrokeW: {
    t: 'Stroke width',
    d: 'Outline thickness in document units.'
  },
  veTextNewLine: {
    t: 'New Line',
    d: 'Adds a new line to the text.'
  },
  veTextPanel: {
    t: 'Text & Typography',
    d: 'Sets the font, size, and style of the selected text.'
  },
  veTextTool: {
    k: 'T',
    t: 'Text Tool',
    d: 'Click on the canvas to create an SVG text object.'
  },
  veToggleHidden: {
    k: 'Ctrl + Shift + H',
    t: 'Show / Hide Layer',
    d: 'Shows or hides the selected layer.'
  },
  veToolGroup: {
    t: 'Choose a tool in the group',
    d: 'Opens the list of other tools grouped with this button.'
  },
  veTypeCorner: {
    t: 'Corner Type',
    d: 'Sharp corner node; left and right handles are independent. When 2+ nodes are selected and nearly collinear, nodes are straightened too; when a handle is selected, the handle is straightened.'
  },
  veTypeSmooth: {
    t: 'Smooth Type',
    d: 'Handles in opposite directions (G1); handle lengths may differ.'
  },
  veTypeSym: {
    t: 'Symmetric Type',
    d: 'Handles in opposite directions with equal length (G1 + symmetry).'
  },
  veUndo: {
    k: 'Ctrl + Z',
    t: 'Undo',
    d: 'Undoes the last change.'
  },
  veUp: {
    k: ']',
    t: 'Bring forward',
    d: 'Moves the selected objects one step forward.'
  },
  veXfFlipH: {
    t: 'Flip horizontal',
    d: 'Mirrors the selection left-right around the center (or pivot point).'
  },
  veXfFlipV: {
    t: 'Flip vertical',
    d: 'Mirrors the selection top-bottom around the center (or pivot point).'
  },
  veXfH: {
    t: 'Height (H)',
    d: 'Height of the selection bounding box. Objects scale around the pivot; curves and handles change proportionally.',
    w: 'Not available while editing nodes.'
  },
  veXfLock: {
    t: 'Lock proportions',
    d: 'When on, changing W automatically changes H by the same ratio (and vice versa).'
  },
  veXfPanel: {
    t: 'Transform',
    d: 'Sets the position (X, Y), size (W, H), and rotation of the selection with precise numbers. The 9-point pivot sets the measurement reference.'
  },
  veXfPin: {
    t: '9-point pivot',
    d: 'Chooses the reference point on the bounding box: used to read X/Y, as the fixed point when W/H change, and as the rotation center when "Pivot" is selected.'
  },
  veXfPivC: {
    t: 'From center',
    d: 'Rotates and mirrors around the center of the bounding box.'
  },
  veXfPivP: {
    t: 'From pivot point',
    d: 'Rotates and mirrors around the currently selected 9-point pivot.'
  },
  veXfPivot: {
    t: 'Rotation & flip center',
    d: 'Sets the fixed point when rotating or mirroring the selection.'
  },
  veXfRot: {
    t: 'Rotation (°)',
    d: 'Object rotation angle, from -180° to 180°. The angle is stored on the object so it stays readable after rotating. For multi-object selections, the value is treated as a relative rotation from 0°.',
    w: 'Not available while editing nodes.'
  },
  veXfStroke: {
    t: 'Scale stroke',
    d: 'When on, stroke thickness scales along when W/H change. When off, stroke thickness stays fixed.'
  },
  veXfW: {
    t: 'Width (W)',
    d: 'Width of the selection bounding box. Objects scale around the pivot; curves and handles change proportionally.',
    w: 'Not available while editing nodes.'
  },
  veXfX: {
    t: 'Position X',
    d: 'Horizontal coordinate of the pivot on the selection bounding box. Type a number then Enter; up/down arrows = ±1 (Shift = ±10).'
  },
  veXfY: {
    t: 'Position Y',
    d: 'Vertical coordinate of the pivot on the selection bounding box. Type a number then Enter; up/down arrows = ±1 (Shift = ±10).'
  },
  veZoomFit: {
    k: '0',
    t: 'Fit',
    d: 'Adjusts the zoom so the whole viewBox fits in the canvas, centered.'
  },
  veZoomIn: {
    k: '+',
    t: 'Zoom in',
    d: 'Zooms in the editor canvas view (toward the center).'
  },
  veZoomOut: {
    k: '-',
    t: 'Zoom out',
    d: 'Zooms out the editor canvas view (toward the center).'
  },
  veZoomPct: {
    t: 'Zoom level',
    d: 'Current canvas magnification percentage. 100% = actual size.'
  },
  veZoomSl: {
    k: '+ | - | Scroll',
    t: 'Zoom',
    d: 'Zooms the canvas in or out with no practical limit (0.05% to 500,000%). Mouse scroll follows the cursor position; the ± buttons zoom to the center.'
  },
};

export { TIPS, TIPS_EN };
export default TIPS;
