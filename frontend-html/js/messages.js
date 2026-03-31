/**
 * Sistema de Mensagens - SavePoint Finance
 * Mensagens padronizadas em português para toda a aplicação
 */

export const Messages = {
  // Autenticação
  auth: {
    loginSuccess: 'Login realizado com sucesso!',
    loginError: 'E-mail ou senha incorretos.',
    registerSuccess: 'Conta criada com sucesso! Bem-vindo ao SavePoint!',
    registerError: 'Erro ao criar conta. Verifique os dados e tente novamente.',
    passwordMismatch: 'As senhas não conferem.',
    passwordTooShort: 'A senha deve ter pelo menos 6 caracteres.',
    passwordChanged: 'Senha alterada com sucesso!',
    passwordChangeError: 'Erro ao alterar senha. Verifique a senha atual.',
    sessionExpired: 'Sua sessão expirou. Faça login novamente.',
    accountInactive: 'Conta inativa. Contate o administrador.',
    accountSuspended: 'Conta suspensa. Contate o suporte.',
    subscriptionExpired: 'Assinatura expirada. Renove para continuar usando.',
    emailExists: 'Este e-mail já está cadastrado.',
    emailNotFound: 'E-mail não encontrado.',
    inviteSent: 'Convite enviado com sucesso!',
    inviteRevoked: 'Convite revogado.',
    inviteExpired: 'Convite expirado ou inválido.',
  },

  // Transações
  transactions: {
    created: 'Transação criada com sucesso!',
    updated: 'Transação atualizada com sucesso!',
    deleted: 'Transação excluída com sucesso!',
    createError: 'Erro ao criar transação.',
    updateError: 'Erro ao atualizar transação.',
    deleteError: 'Erro ao excluir transação.',
  },

  // Categorias
  categories: {
    created: 'Categoria criada com sucesso!',
    updated: 'Categoria atualizada com sucesso!',
    deleted: 'Categoria excluída com sucesso!',
    createError: 'Erro ao criar categoria.',
    updateError: 'Erro ao atualizar categoria.',
    deleteError: 'Erro ao excluir categoria.',
    duplicateName: 'Já existe uma categoria com este nome.',
  },

  // Contas
  accounts: {
    created: 'Conta criada com sucesso!',
    updated: 'Conta atualizada com sucesso!',
    deleted: 'Conta excluída com sucesso!',
    createError: 'Erro ao criar conta.',
    updateError: 'Erro ao atualizar conta.',
    deleteError: 'Erro ao excluir conta.',
    limitReached: 'Limite de contas do plano atingido. Faça upgrade para continuar.',
  },

  // Cartões
  cards: {
    created: 'Cartão criado com sucesso!',
    updated: 'Cartão atualizado com sucesso!',
    deleted: 'Cartão excluído com sucesso!',
    createError: 'Erro ao criar cartão.',
    updateError: 'Erro ao atualizar cartão.',
    deleteError: 'Erro ao excluir cartão.',
    limitReached: 'Limite de cartões do plano atingido. Faça upgrade para continuar.',
  },

  // Metas
  goals: {
    created: 'Meta criada com sucesso!',
    updated: 'Meta atualizada com sucesso!',
    deleted: 'Meta excluída com sucesso!',
    deposited: 'Depósito realizado com sucesso!',
    createError: 'Erro ao criar meta.',
    updateError: 'Erro ao atualizar meta.',
    deleteError: 'Erro ao excluir meta.',
    depositError: 'Erro ao realizar depósito.',
    completed: 'Parabéns! Você alcançou sua meta!',
  },

  // Assinaturas
  subscriptions: {
    created: 'Assinatura criada com sucesso!',
    updated: 'Assinatura atualizada com sucesso!',
    deleted: 'Assinatura excluída com sucesso!',
    transactionGenerated: 'Transação gerada com sucesso!',
    createError: 'Erro ao criar assinatura.',
    updateError: 'Erro ao atualizar assinatura.',
    deleteError: 'Erro ao excluir assinatura.',
  },

  // Planos
  plans: {
    changed: 'Plano alterado com sucesso!',
    changeError: 'Erro ao alterar plano.',
    limitUsers: `Este plano suporta até {max} usuário(s).`,
    limitAccounts: `Este plano suporta até {max} conta(s).`,
    limitCategories: `Este plano suporta até {max} categoria(s).`,
    limitTransactions: 'Limite de transações do plano atingido. Upgrade para ilimitadas.',
    featureUnavailable: 'Feature disponível apenas nos planos Pro ou Enterprise.',
  },

  // Admin
  admin: {
    tenantCreated: 'Workspace criado com sucesso!',
    tenantUpdated: 'Workspace atualizado com sucesso!',
    tenantDeleted: 'Workspace excluído com sucesso!',
    userUpdated: 'Usuário atualizado com sucesso!',
    userDeleted: 'Usuário excluído com sucesso!',
    userPasswordReset: 'Senha do usuário resetada com sucesso!',
    statsLoaded: 'Stats carregadas com sucesso!',
  },

  // Export/Import
  data: {
    exportSuccess: 'Dados exportados com sucesso!',
    exportError: 'Erro ao exportar dados.',
    importSuccess: 'Dados importados com sucesso! ({count} transações)',
    importError: 'Erro ao importar dados.',
    importPartial: 'Importação parcial: {count} transações importadas com {errors} erros.',
    templateDownloaded: 'Template baixado com sucesso!',
  },

  // Erros genéricos
  generic: {
    networkError: 'Sem conexão com o servidor. Verifique sua internet.',
    serverError: 'Erro no servidor. Tente novamente mais tarde.',
    unknownError: 'Ocorreu um erro inesperado.',
    unauthorized: 'Você não tem permissão para esta ação.',
    notFound: 'Item não encontrado.',
    validationError: 'Dados inválidos. Verifique os campos.',
    loadingError: 'Erro ao carregar dados.',
  },

  // Sucesso genérico
  success: {
    saved: 'Salvo com sucesso!',
    deleted: 'Excluído com sucesso!',
    created: 'Criado com sucesso!',
    updated: 'Atualizado com sucesso!',
    sent: 'Enviado com sucesso!',
    copied: 'Copiado para a área de transferência!',
  },

  // Confirmações
  confirm: {
    delete: 'Tem certeza que deseja excluir?',
    deleteTransaction: 'Tem certeza que deseja excluir esta transação?',
    deleteCategory: 'Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita.',
    deleteAccount: 'Tem certeza que deseja excluir esta conta?',
    deleteGoal: 'Tem certeza que deseja excluir esta meta?',
    logout: 'Tem certeza que deseja sair?',
  },

  // Validações
  validation: {
    required: 'Este campo é obrigatório.',
    email: 'E-mail inválido.',
    minLength: 'Mínimo de {min} caracteres.',
    maxLength: 'Máximo de {max} caracteres.',
    positiveNumber: 'Deve ser um número positivo.',
    futureDate: 'A data deve ser no futuro.',
    pastDate: 'A data deve ser no passado.',
  },

  // Placeholders
  placeholders: {
    search: 'Buscar...',
    selectCategory: 'Selecionar categoria',
    selectAccount: 'Selecionar conta',
    selectCard: 'Selecionar cartão',
    description: 'Ex: Alimentação, Transporte...',
    amount: '0,00',
    notes: 'Observações...',
  },
};

// Helper para formatar mensagens com variáveis
export function formatMessage(template, vars = {}) {
  let msg = template;
  for (const [key, value] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return msg;
}

// Classes de estilo para cada tipo de mensagem
export const MessageKinds = {
  success: { icon: '✓', class: 'toast--success' },
  error: { icon: '✕', class: 'toast--error' },
  warning: { icon: '⚠', class: 'toast--warning' },
  info: { icon: 'ℹ', class: 'toast--info' },
};
