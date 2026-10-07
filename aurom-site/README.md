# Site Aurom Tech

Site institucional da Aurom Tech em um único arquivo (`index.html`), sem build e sem dependências: abre direto no navegador e publica em qualquer hospedagem estática (Cloudflare Pages, Netlify, GitHub Pages).

## Estrutura da página

| Seção | Função |
|---|---|
| Hero + Diagnóstico rápido | Tese da marca e seletor "Qual é o seu desafio hoje?", que indica o serviço, o primeiro passo e um serviço complementar, e preenche o formulário |
| Conceito da marca | Evolução, Tecnologia, Conexão, Confiança |
| Serviços | 6 serviços em dois eixos: **Construir** (Web/Software, Mobile) e **Sustentar** (Manutenção, Redes, Segurança, Upgrade) |
| Por que a Aurom | As 4 camadas da tecnologia (equipamentos, rede, dados, software) e a proposta de parceiro único |
| Como trabalhamos / Para quem | Processo em 4 etapas e públicos atendidos |
| Dúvidas | FAQ |
| Contato | Formulário que monta a mensagem para WhatsApp ou e-mail |

## Antes de publicar

No início do `<script>`, preencha o objeto `CONFIG`:

- `whatsapp`: número com DDI e DDD, só dígitos (ex.: `5511912345678`). Ativa o botão flutuante e o envio pelo WhatsApp.
- `telefoneExibicao`, `email`, `cidade`, `horario`: campos vazios somem do site.

Confirme também as afirmações comerciais do texto: orçamento sem custo, atendimento presencial e remoto, garantia sobre o serviço e cópia dos dados antes da formatação.

Paleta e tipografia seguem o manual da marca: `#0066FF`, `#0B1F44`, `#050B17`, `#E5E7EB`, `#1F2937`; Sora (títulos), Figtree (texto) e Michroma (rótulos).
