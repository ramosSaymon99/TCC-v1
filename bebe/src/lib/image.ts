/** Lê uma imagem escolhida (galeria ou câmera), recorta ao centro em quadrado e reduz para JPEG leve. */
export async function prepararFoto(file: File, lado = 320, qualidade = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não foi possível ler esta imagem. Tente JPG ou PNG.'));
      i.src = url;
    });
    const menor = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - menor) / 2;
    const sy = (img.naturalHeight - menor) / 2;
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, menor, menor, 0, 0, lado, lado);
    return c.toDataURL('image/jpeg', qualidade);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Foto do Dia a dia: mantém a proporção, lado maior até `max` px, e reduz a qualidade até caber no limite do servidor. */
export async function prepararFotoPost(file: File, max = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não foi possível ler esta imagem. Tente JPG ou PNG.'));
      i.src = url;
    });
    const esc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * esc);
    c.height = Math.round(img.naturalHeight * esc);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.72, 0.6, 0.5]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length < 700_000) return d;
    }
    throw new Error('Imagem muito grande. Tente outra foto.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
