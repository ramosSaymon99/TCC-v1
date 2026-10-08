# NutriGest · Consultório de Nutrição

App web de gestão para nutricionistas: atendimento clínico (prontuário, avaliações, plano alimentar) integrado à gestão do consultório (agenda, financeiro, captação e retenção de pacientes).

## Telas

| Tela | O que resolve |
|------|---------------|
| **Início** | KPIs do mês (faturamento × meta e projeção, consultas, taxa de faltas, pacientes em acompanhamento) comparados com os mesmos dias do mês anterior, e painel **"Onde agir agora"** com alertas ordenados por impacto: consultas sem confirmação, retornos vencidos (R$ em risco), pacientes em platô, horas ociosas na agenda, faltas, recebíveis e canal mais rentável |
| **Agenda** | Visão dia/semana, confirmação por WhatsApp com mensagem pronta, realizada/faltou/cancelada, ocupação da capacidade, receita prevista, detecção de conflito de horário |
| **Pacientes** | Status automático (novo, em acompanhamento, retorno vencido, inativo), evolução de peso, receita por paciente, convite de retorno por WhatsApp, exportação CSV |
| **Ficha do paciente** | Evolução (peso, % gordura, cintura, IMC), anamnese, consultas e pagamentos, pacotes com saldo, necessidade energética estimada |
| **Plano alimentar** | Sugestão automática ajustada à meta (kcal e proteína), edição por refeição, planejado × meta, distribuição de macros, g/kg, fibras, medida caseira e impressão/PDF |
| **Alimentos** | Tabela de composição editável (base TACO/USDA aproximada) |
| **Calculadoras** | IMC, TMB (Mifflin-St Jeor e Harris-Benedict), GET, macros por objetivo, RCQ e risco pela cintura |
| **Financeiro** | Faturamento, despesas, resultado e margem; efeito volume × preço por tipo de consulta; ponto de equilíbrio; a receber; lançamentos |
| **Captação e retenção** | Por canal de origem: novos, consultas/paciente, taxa de retorno, LTV, CAC e ROI; funil de permanência; desempenho por objetivo |
| **Configurações** | Dados profissionais, preços/duração (R$/hora), meta mensal, intervalo de retorno, capacidade, backup/restauração |

## Rodar

```bash
cd nutri
npm install
npm run dev            # desenvolvimento
npm run build:single   # gera dist-single/index.html (app inteiro em um arquivo, abre direto no navegador)
```

## Observações

- Os dados ficam no `localStorage` do navegador (uso individual). Faça backup em Configurações; o arquivo contém dados de saúde (LGPD) e deve ser guardado com segurança.
- A base vem com dados fictícios de demonstração (200 pacientes em 8 meses) — use "Restaurar demonstração" ou importe um backup vazio/real para começar.
- Cálculos de gasto energético e metas são pontos de partida; a conduta clínica é sempre da nutricionista.
