// Shared helpers for the vehicle-check photo flow: client-side compression
// (keeps uploads small and fast on mobile data) and a minimal EXIF reader
// that pulls the "photo actually taken at" timestamp out of a JPEG, so we
// can tell the admin if a photo looks like it was picked from the gallery
// days later rather than just taken.

// Resizes+re-encodes an image file down to a JPEG under roughly
// maxDimension px on the long edge. Returns a Blob.
function compressImage(file, maxDimension = 1600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process photo"))), "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load photo"));
    };
    img.src = url;
  });
}

// Reads the EXIF "DateTimeOriginal" (falls back to "DateTime") out of a
// JPEG file. Returns a Date, or null if the file has no EXIF data (common
// for screenshots, downloaded images, or some browsers' camera capture).
async function readExifDate(file) {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xffd8) return null; // not a JPEG

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xffe1) {
        return parseExifSegment(view, offset + 4);
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch (e) {
    /* not fatal — just means we can't verify capture time */
  }
  return null;
}

function parseExifSegment(view, start) {
  if (view.getUint32(start) !== 0x45786966) return null; // "Exif"
  const tiffStart = start + 6;
  const little = view.getUint16(tiffStart) === 0x4949;
  const get16 = (o) => view.getUint16(o, little);
  const get32 = (o) => view.getUint32(o, little);

  const ifdOffset = tiffStart + get32(tiffStart + 4);
  const entries = get16(ifdOffset);
  let exifIfdOffset = null;

  for (let i = 0; i < entries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = get16(entryOffset);
    if (tag === 0x8769) exifIfdOffset = tiffStart + get32(entryOffset + 8); // pointer to Exif sub-IFD
  }

  const readDateFromIfd = (ifdStart) => {
    const count = get16(ifdStart);
    for (let i = 0; i < count; i++) {
      const entryOffset = ifdStart + 2 + i * 12;
      const tag = get16(entryOffset);
      if (tag === 0x9003 || tag === 0x0132) {
        const valueOffset = tiffStart + get32(entryOffset + 8);
        let str = "";
        for (let j = 0; j < 19; j++) str += String.fromCharCode(view.getUint8(valueOffset + j));
        // Format: "YYYY:MM:DD HH:MM:SS"
        const m = str.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
      }
    }
    return null;
  };

  if (exifIfdOffset) {
    const d = readDateFromIfd(exifIfdOffset);
    if (d) return d;
  }
  return readDateFromIfd(ifdOffset);
}
