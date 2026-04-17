import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { PRIVACY_POLICY_PATH, TERMS_OF_USE_VERSION } from "@/lib/legal/documents";

export default function TermsOfUsePage() {
  return (
    <main id="main-content" className="page-shell py-8 md:py-10">
      <section className="surface-strong rounded-[36px] p-8 md:p-10">
        <div className="section-stack">
          <BrandMark inverted compact />
          <div className="eyebrow border-white/18 bg-white/8 text-white">Termos de Uso</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Condições de uso do Save Point Finança.</h1>
          <p className="max-w-3xl text-base leading-8 text-white/84">
            Versão {TERMS_OF_USE_VERSION}. Estes termos disciplinam o acesso ao produto financeiro, aos convites de
            carteira compartilhada e ao uso das funcionalidades disponibilizadas por assinatura.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        <article className="surface content-section">
          <h2 className="section-title">1. Partes e objeto</h2>
          <p className="section-copy">
            O Save Point Finança é um software de organização financeira pessoal e familiar. Ao aceitar um convite,
            criar senha ou acessar o painel, o usuário declara que leu estes termos e passa a utilizar a plataforma
            para controle de contas, cartões, metas, alertas, compartilhamentos e relatórios.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">2. Cadastro, credenciais e convites</h2>
          <p className="section-copy">
            O acesso pode depender de convite válido emitido por administrador da conta ou por titular de carteira
            compartilhada. O usuário deve fornecer dados verdadeiros, manter a senha sob sigilo e comunicar
            imediatamente qualquer suspeita de uso indevido.
          </p>
          <p className="section-copy">
            O titular é responsável pelos atos praticados com suas credenciais até a comunicação do incidente pelos
            canais de suporte disponibilizados no produto.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">3. Regras de uso aceitável</h2>
          <p className="section-copy">
            É vedado usar a plataforma para fraude, violação de segurança, tentativa de acesso não autorizado,
            engenharia reversa indevida, extração massiva de dados, envio de conteúdo ilícito ou qualquer uso contrário
            à legislação aplicável.
          </p>
          <p className="section-copy">
            O serviço poderá suspender acessos, convites e integrações quando houver indício técnico ou jurídico de uso
            abusivo, risco operacional, violação contratual ou exigência legal.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">4. Assinatura, disponibilidade e limites</h2>
          <p className="section-copy">
            O acesso a funcionalidades depende do plano contratado e da licença ativa da conta. Recursos, limites,
            integrações e disponibilidade podem variar conforme o plano vigente.
          </p>
          <p className="section-copy">
            O serviço busca operação contínua, mas pode executar manutenção programada, bloqueio de licença,
            atualização de segurança, contingência operacional e interrupções justificadas para preservação da
            integridade do ambiente.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">5. Propriedade intelectual</h2>
          <p className="section-copy">
            O software, sua interface, sua marca, seu código, seus relatórios, seu layout e sua documentação pertencem
            aos titulares de seus respectivos direitos. Os dados financeiros inseridos pelo usuário permanecem de sua
            titularidade ou de quem legitimamente os fornecer.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">6. Privacidade, segurança e trilha de auditoria</h2>
          <p className="section-copy">
            O produto mantém controles de autenticação, isolamento lógico por tenant, trilha de auditoria para eventos
            sensíveis e registro do último acesso exibido ao usuário na área autenticada. Esses mecanismos não eliminam
            todos os riscos, mas reduzem exposição e ajudam na detecção de uso anômalo.
          </p>
          <p className="section-copy">
            O tratamento de dados pessoais segue a{" "}
            <Link className="font-semibold text-[var(--color-primary)]" href={PRIVACY_POLICY_PATH}>
              Política de Privacidade
            </Link>{" "}
            vigente e a legislação brasileira aplicável, incluindo a LGPD.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">7. Limitação de responsabilidade</h2>
          <p className="section-copy">
            O Save Point Finança é ferramenta de apoio à gestão financeira e não substitui aconselhamento contábil,
            jurídico, fiscal, bancário ou de investimentos. Decisões financeiras tomadas com base nos dados exibidos
            continuam sob responsabilidade do usuário.
          </p>
        </article>

        <article className="surface content-section">
          <h2 className="section-title">8. Vigência e alterações</h2>
          <p className="section-copy">
            Estes termos entram em vigor na data da versão indicada nesta página e podem ser atualizados para refletir
            mudanças legais, técnicas, operacionais ou comerciais. Quando a mudança exigir novo aceite, o fluxo de
            acesso solicitará concordância expressa antes da continuidade do uso.
          </p>
        </article>
      </section>
    </main>
  );
}
