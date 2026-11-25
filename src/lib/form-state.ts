export type FormState = {
  error?: string;
  success?: string;
  /** Valores extras para a tela (ex.: link de convite no modo sandbox). */
  data?: Record<string, string>;
} | null;

type PgLikeError = { code?: string; message?: string } | null | undefined;

/** Traduz erros do banco/Auth para mensagens seguras, sem vazar detalhes internos. */
export function friendlyError(err: PgLikeError, fallback = "Não foi possível concluir. Tente novamente.") {
  if (!err) return fallback;
  if (err.code === "42501") return "Você não tem permissão para esta ação.";
  if (err.code === "23505") return "Já existe um registro igual.";
  if (err.code === "P0001" || err.code === "P0002" || err.code === "54000") return err.message ?? fallback;
  // Mensagens das nossas funções (raise exception) já são em português e seguras.
  if (err.message && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^{}<>]*$/.test(err.message) && !/violates|permission|relation|column/i.test(err.message)) {
    return err.message;
  }
  return fallback;
}
