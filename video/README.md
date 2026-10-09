# Vídeo "modo de uso" do Ninho

`ninho-modo-de-uso.mp4`: vertical 1080×1920, 86 s, para enviar às novas famílias (família e dados fictícios).

Para regerar:
1. Suba o app local (`cd bebe && npx wrangler dev --port 8787`).
2. `npx esbuild bebe/src/lib/demo.ts --bundle --format=esm --platform=node --outfile=video/demo.mjs`
3. `node video/capturar.mjs` (captura as telas em `video/telas/`).
4. `node video/render.mjs completo` e depois
   `ffmpeg -framerate 30 -i video/quadros/%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart video/ninho-modo-de-uso.mp4`

`motion.html` também roda direto no navegador como prévia animada.
