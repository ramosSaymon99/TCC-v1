import { Sheet } from './ui';

/** Contato do controlador dos dados — defina VITE_CONTATO_PRIVACIDADE no build (ex.: e-mail do responsável pelo app). */
const CONTATO = (import.meta.env.VITE_CONTATO_PRIVACIDADE as string | undefined) || '';
export const VERSAO_TERMOS = '2026-10';

export function PoliticaSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Privacidade e Termos de Uso" onClose={onClose}>
      <div className="stack legal" style={{ gap: 10 }}>
        <p className="faint">Versão {VERSAO_TERMOS}. Texto-base para o TCC; antes de uso comercial, revise com assessoria jurídica.</p>

        <h3>1. O que é o Ninho</h3>
        <p>Um app para a família registrar e acompanhar a rotina de um bebê ou criança (sono, alimentação, fraldas, saúde e materiais), compartilhada apenas entre os cuidadores convidados.</p>

        <h3>2. Dados que tratamos</h3>
        <ul>
          <li><b>Seus dados:</b> nome, e-mail, senha (guardada só como hash PBKDF2, nunca em texto), foto opcional, papel na família e aparelhos onde você ativou notificações.</li>
          <li><b>Dados da criança:</b> nome, data de nascimento, sexo, foto opcional, registros de rotina, medidas de crescimento, consultas, vacinas, remédios e observações que a família escrever.</li>
          <li><b>Dados técnicos:</b> endereço IP usado apenas para limitar tentativas de login (apagado em até 24 h).</li>
          <li><b>Estatísticas de operação:</b> região aproximada (país, estado e cidade, estimados pela rede de internet, nunca por GPS ou endereço), tipo e modelo do aparelho (quando o navegador informa), navegador, se o app está instalado e erros técnicos, ligados a um código embaralhado — não ao seu nome ou e-mail. São vistos pelos desenvolvedores apenas em números agregados (grupos com menos de 3 pessoas não aparecem).</li>
          <li><b>Uso de funcionalidades:</b> contagem de ações como "relatório gerado", "notificação aberta" ou "desfazer", sem o conteúdo dos registros, para avaliar e melhorar o app.</li>
        </ul>

        <h3>3. Para que usamos</h3>
        <p>Exclusivamente para o funcionamento do app: mostrar a rotina, calcular indicadores, gerar o relatório para o pediatra e enviar as notificações que você escolher. <b>Não vendemos dados, não exibimos publicidade e não usamos os dados da criança para nenhuma outra finalidade.</b></p>

        <h3>4. Dados de crianças (LGPD, art. 14)</h3>
        <p>Os dados da criança só são tratados com o consentimento de pelo menos um dos pais ou responsável legal, dado por quem cadastra o perfil da criança. Quem cadastra declara ser responsável legal ou estar autorizado por um deles, e é quem decide quem pode ver e registrar (convites e níveis de acesso).</p>

        <h3>5. Com quem compartilhamos</h3>
        <p>Somente com as pessoas que um administrador do perfil da criança convidar. Os dados ficam armazenados na infraestrutura da Cloudflare (Workers e D1), que atua como operadora. O relatório em PDF é gerado no seu aparelho e só é compartilhado se você mesmo enviar. As notificações passam pelos serviços de push do seu navegador (Google, Apple, Mozilla ou Microsoft) já criptografadas.</p>

        <h3>6. Segurança</h3>
        <p>Conexão criptografada (HTTPS), senhas com hash, sessões assinadas que expiram, limite de tentativas de login, fotos acessíveis só por link assinado entregue a quem tem acesso, e verificação de permissão em cada operação no servidor.</p>

        <h3>7. Por quanto tempo</h3>
        <p>Enquanto a conta existir. Contas de exemplo são apagadas automaticamente 24 h depois de criadas.</p>

        <h3>8. Seus direitos</h3>
        <ul>
          <li><b>Acesso e correção:</b> pelo próprio app (perfil, registros e perfil da criança).</li>
          <li><b>Portabilidade:</b> Família → Dados → <i>Exportar dados (JSON)</i>.</li>
          <li><b>Exclusão:</b> Família → Meu perfil → <i>Excluir minha conta</i>. Se você for o único cuidador de uma criança, o perfil dela e todo o histórico são apagados; se houver outros cuidadores, o histórico continua com a família e seus dados pessoais são removidos.</li>
          <li><b>Revogar o consentimento</b> a qualquer momento, excluindo a conta ou o perfil da criança.</li>
        </ul>

        <h3>9. Uso responsável</h3>
        <p>O Ninho organiza informações; ele <b>não faz diagnóstico nem substitui o pediatra</b>. As faixas de referência são gerais (AAP, AASM, SBP, PNI). Em caso de sinais de alerta, procure atendimento.</p>

        <h3>10. Contato</h3>
        <p>{CONTATO ? <>Dúvidas ou pedidos sobre seus dados: <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.</> : 'Dúvidas ou pedidos sobre seus dados: pelo canal de contato informado por quem disponibilizou este app.'}</p>
      </div>
    </Sheet>
  );
}
