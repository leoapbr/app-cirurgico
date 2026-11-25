import "server-only";

type Mail = { to: string; subject: string; text: string };

/**
 * Envio de e-mail em modo sandbox por padrão (PRD §12): nada sai do servidor,
 * a mensagem vai para o log. Para enviar de verdade, defina MAIL_MODE=live,
 * RESEND_API_KEY e MAIL_FROM no servidor, e MAIL_ALLOWED_DOMAINS para limitar
 * os destinatários de teste.
 * E-mails nunca levam dados de paciente; só links que exigem login.
 */
export async function sendMail(mail: Mail): Promise<{ delivered: boolean; mode: "sandbox" | "live" }> {
  const live = process.env.MAIL_MODE === "live" && process.env.RESEND_API_KEY && process.env.MAIL_FROM;
  const allowed = (process.env.MAIL_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domain = mail.to.split("@")[1]?.toLowerCase() ?? "";

  if (!live || (allowed.length > 0 && !allowed.includes(domain))) {
    console.info(`[mail:sandbox] para=${mail.to} assunto="${mail.subject}"`);
    return { delivered: false, mode: "sandbox" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) {
    console.error(`[mail:live] falha ${res.status} ao enviar para ${domain}`);
    return { delivered: false, mode: "live" };
  }
  return { delivered: true, mode: "live" };
}

export const isMailSandbox = () => process.env.MAIL_MODE !== "live";
