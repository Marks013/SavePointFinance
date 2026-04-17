import { BrandMark } from "@/components/layout/brand-mark";
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/documents";

export default function PrivacyPolicyPage() {
  return (
    <main id="main-content" className="page-shell py-8 md:py-10">
      <section className="surface-strong rounded-[36px] p-8 md:p-10">
        <div className="section-stack">
          <BrandMark inverted compact />
          <div className="eyebrow border-white/18 bg-white/8 text-white">Política de Privacidade</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Como o Save Point Finança trata seus dados.</h1>
          <p className="max-w-3xl text-base leading-8 text-white/84">
            Versão {PRIVACY_POLICY_VERSION}. Este documento descreve quais dados pessoais são tratados, por quais
            finalidades, em quais bases legais e quais direitos podem ser exercidos pelo titular.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        <article className="surface content-section">
          <h2 className="section-title">1. Escopo</h2>
          <p className="section-copy">
            Esta política se aplica ao uso do Save Point Finança em seus fluxos de autenticação, convite, gestão
            financeira e suporte operacional.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">2. Dados tratados</h2>
          <p className="section-copy">
            Podemos tratar dados cadastrais e de autenticação, como nome, e-mail, credenciais protegidas, identificador
            da conta, perfil de acesso, registros de convites, preferências do usuário e dados de sessão.
          </p>
          <p className="section-copy">
            No uso do produto, também podem ser tratados dados financeiros inseridos ou sincronizados pelo usuário,
            incluindo contas, cartões, categorias, metas, transações, recorrências, comprovantes e registros
            relacionados à operação da carteira.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">3. Finalidades e bases legais</h2>
          <p className="section-copy">
            O tratamento ocorre, principalmente, para execução do contrato ou de procedimentos preliminares solicitados
            pelo titular, autenticação de acesso, operação do painel, compartilhamento controlado de carteira, prevenção
            a fraude, segurança, suporte e cumprimento de obrigações legais ou regulatórias.
          </p>
          <p className="section-copy">
            Quando cabível, também podem ser utilizadas bases como legítimo interesse compatível com a LGPD, sempre com
            avaliação de necessidade, proporcionalidade e respeito aos direitos e liberdades fundamentais do titular.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">4. Segurança e monitoramento</h2>
          <p className="section-copy">
            O ambiente adota controles técnicos e organizacionais como isolamento de dados por tenant, proteção de
            credenciais, controle de sessão, limitação de acesso por perfil, registros de auditoria e exibição do último
            acesso na área autenticada. Esses controles visam reduzir risco de acesso indevido, fraude e abuso da conta.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">5. Compartilhamento de dados</h2>
          <p className="section-copy">
            Os dados podem ser compartilhados com operadores essenciais para hospedagem, autenticação, entrega de
            notificações, observabilidade, processamento técnico e suporte, sempre dentro de finalidades compatíveis com
            a prestação do serviço.
          </p>
          <p className="section-copy">
            O Save Point Finança não comercializa dados pessoais com corretoras, anunciantes ou marketplaces de dados.
            O modelo econômico do produto é baseado em assinatura e licenciamento do serviço.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">6. Retenção e eliminação</h2>
          <p className="section-copy">
            Os dados são mantidos pelo prazo necessário para cumprir as finalidades do tratamento, atender obrigações
            legais, permitir defesa em processos, assegurar rastreabilidade operacional e preservar a integridade do
            histórico da conta enquanto existir relação ativa com o serviço.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">7. Direitos do titular</h2>
          <p className="section-copy">
            Nos termos da LGPD, o titular pode solicitar confirmação da existência de tratamento, acesso, correção,
            anonimização, bloqueio, eliminação quando cabível, portabilidade, informação sobre compartilhamentos,
            revisão de consentimento quando essa for a base legal aplicável e demais direitos previstos em lei.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">8. Canal de atendimento e atualização da política</h2>
          <p className="section-copy">
            Solicitações relacionadas à privacidade devem ser encaminhadas pelo canal de suporte disponibilizado no
            produto ou no convite recebido. Esta política pode ser atualizada para refletir mudanças legais, técnicas e
            operacionais.
          </p>
        </article>
      </section>
    </main>
  );
}
