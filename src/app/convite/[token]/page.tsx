import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { DemoBanner } from "@/components/demo-banner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { rolesLabel } from "@/lib/auth/roles";
import { formatDateTime } from "@/lib/utils";
import { acceptInvitation, declineInvitation } from "./actions";

export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

type Preview = { organization_name: string; roles: string[]; email_hint: string; expires_at: string; status: string };

const STATUS_TEXT: Record<string, string> = {
  aceito: "Este convite já foi aceito.",
  recusado: "Este convite foi recusado.",
  cancelado: "Este convite foi cancelado por quem enviou.",
  expirado: "Este convite expirou. Peça um novo ao administrador da organização.",
};

export default async function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data }, { data: claims }] = await Promise.all([
    supabase.rpc("get_org_invitation", { p_token: token }),
    supabase.auth.getClaims(),
  ]);
  const invite = (data as Preview[] | null)?.[0];
  const loggedIn = Boolean(claims?.claims?.sub);
  const sessionEmail = String(claims?.claims?.email ?? "");
  const { data: isForMe } =
    loggedIn && invite?.status === "pendente"
      ? await supabase.rpc("org_invitation_is_for_me", { p_token: token })
      : { data: null };
  const here = `/convite/${encodeURIComponent(token)}`;

  return (
    <>
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Convite para organização</CardTitle>
            {invite && (
              <CardDescription>
                Você foi convidado para <strong>{invite.organization_name}</strong> como {rolesLabel(invite.roles)}.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {!invite && <Alert variant="destructive">Convite não encontrado. Confira o link recebido por e-mail.</Alert>}
            {invite && invite.status !== "pendente" && <Alert>{STATUS_TEXT[invite.status]}</Alert>}
            {invite && invite.status === "pendente" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Enviado para {invite.email_hint}. Válido até {formatDateTime(invite.expires_at)}. Para aceitar, entre ou
                  crie a conta com esse mesmo e-mail.
                </p>
                {loggedIn && isForMe === false ? (
                  <div className="grid gap-3">
                    <Alert variant="destructive">
                      Você está conectado como <strong>{sessionEmail}</strong>, mas este convite foi enviado para{" "}
                      {invite.email_hint}. Saia e entre (ou crie a conta) com o e-mail do convite.
                    </Alert>
                    <form action="/auth/sair" method="post">
                      <input type="hidden" name="next" value={here} />
                      <Button type="submit" variant="outline">Sair e usar outro e-mail</Button>
                    </form>
                  </div>
                ) : loggedIn ? (
                  <ActionForm action={acceptInvitation} submitLabel="Aceitar convite" pendingLabel="Aceitando…">
                    <input type="hidden" name="token" value={token} />
                  </ActionForm>
                ) : (
                  <div className="flex gap-2">
                    <Button asChild>
                      <Link href={`/entrar?next=${encodeURIComponent(here)}`}>Entrar para aceitar</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/criar-conta?next=${encodeURIComponent(here)}`}>Criar conta</Link>
                    </Button>
                  </div>
                )}
                <div className="border-t pt-4">
                  <p className="mb-2 text-sm text-muted-foreground">Não quer participar? Você pode recusar sem criar conta.</p>
                  <ActionForm action={declineInvitation} submitLabel="Recusar convite" variant="outline" size="sm">
                    <input type="hidden" name="token" value={token} />
                  </ActionForm>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
