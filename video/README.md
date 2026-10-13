# Vídeo "modo de uso" do Ninho

- `ninho-modo-de-uso.mp4`: vertical 1080×1920, ~113 s, para enviar às novas famílias (família e dados fictícios).
- `ninho-modo-de-uso-whatsapp.mp4`: 720×1280, compatível com o WhatsApp.
- `ninho-essencial-60s.mp4` / `ninho-essencial-60s-whatsapp.mp4`: versão essencial de 60 s (12 capítulos, um destaque por tela,
  cortes no tempo da música).

Trilha sonora original, sintetizada por `trilha.py` (pop leve a 120 bpm em Fá maior, sem direitos de terceiros), com efeitos
discretos nos cortes de tela, balões e toques, sincronizados pela linha do tempo do vídeo.

Roteiro (13 capítulos): conta → bebê e rotina pronta → primeiros passos → registro em 1 toque → convite da família →
o que vem agora (previsões e plantão) → onde agir → rotina com check e sugestão → remédio com alerta de dose dupla →
Dia a dia (fotos, curtidas, mêsversário) → Evolução → Saúde → Casa (mural, leite e plantão).

Para regerar:
1. Suba o app local com banco limpo:
   `cd bebe && npm run build && npx wrangler dev --port 8787 --persist-to /tmp/ninho-video` e, em outro terminal,
   `npx wrangler d1 execute ninho-db --local --persist-to /tmp/ninho-video --file worker/schema.sql`
2. `npx esbuild bebe/src/lib/demo.ts --bundle --format=esm --platform=node --outfile=video/demo.mjs`
3. `node video/capturar.mjs` (captura as telas em `video/telas/`; usa `video/foto.jpg` como foto fictícia do Dia a dia).
4. `node video/render.mjs completo` e depois
   `ffmpeg -framerate 30 -i video/quadros/%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow -movflags +faststart video/ninho-modo-de-uso.mp4`
5. Trilha e áudio: `node video/render.mjs eventos > ev.json && python3 video/trilha.py ev.json trilha.wav`, depois
   `ffmpeg -framerate 30 -i video/quadros/%05d.jpg -i trilha.wav -af loudnorm=I=-14:TP=-1.5:LRA=7 -c:v libx264 -pix_fmt yuv420p -crf 20 -c:a aac -b:a 160k -shortest -movflags +faststart video/ninho-modo-de-uso.mp4`
6. Versão WhatsApp:
   `ffmpeg -i video/ninho-modo-de-uso.mp4 -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p -vf scale=720:1280 -crf 23 -c:a aac -b:a 128k -movflags +faststart video/ninho-modo-de-uso-whatsapp.mp4`

Versão essencial: rode os passos 4–6 com `VERSAO=essencial` (quadros em `video/quadros-60/`, roteiro `ROTEIRO_60`;
no navegador, `motion.html?v=essencial`).

O roteiro fica em `ROTEIRO` dentro de `motion.html` (tempos relativos a cada tela; destaques em px do app 390×844).
`node video/render.mjs teste 10 20.5` gera quadros avulsos para conferir. `motion.html` também roda direto no navegador como prévia animada.
O cadastro tem limite de 12 contas por IP a cada 15 min: se a captura falhar no cadastro, use outro `--persist-to`.
