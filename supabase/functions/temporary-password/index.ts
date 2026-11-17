import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { passwordSetup, type Setup } from "./flow.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (
    Deno.env.get("ALLOWED_ORIGINS") || "https://brancoretto24102-ui.github.io"
  )
    .split(",")
    .map((s) => s.trim());
  const headers = {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (!allowed.includes(origin))
    return reply(403, { error: "Origen no autorizado." });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return reply(405, { error: "Método no permitido." });
  if (Number(req.headers.get("content-length") ?? 0) > 4096)
    return reply(413, { error: "Solicitud demasiado grande." });
  try {
    const raw = await req.text();
    if (raw.length > 4096)
      return reply(413, { error: "Solicitud demasiado grande." });
    const body = JSON.parse(raw);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const table = () => admin.from("temporary_password_setups");
    const fields =
      "user_id,generation,version,state,expires_at,challenge_expires_at,token_hash";
    const identity = (query: any, row: Setup) =>
      query
        .eq("user_id", row.user_id)
        .eq("generation", row.generation)
        .eq("version", row.version);
    const flow = passwordSetup({
      async find(kind, hash) {
        const { data, error } = await table()
          .select(fields)
          .eq(kind, hash)
          .maybeSingle();
        if (error) throw new Error("No se pudo comprobar la clave temporal.");
        return data;
      },
      async email(id) {
        const { data: profile, error } = await admin
          .from("profiles")
          .select("active,deleted_at")
          .eq("id", id)
          .single();
        if (error || !profile?.active || profile.deleted_at) return null;
        const { data: account, error: authError } =
          await admin.auth.admin.getUserById(id);
        return authError ? null : (account.user?.email ?? null);
      },
      async claim(row, hash, expires) {
        const { data, error } = await identity(
          table().update({
            challenge_hash: hash,
            challenge_expires_at: expires,
            state: "claimed",
          }),
          row,
        ).select("user_id");
        return !error && data?.length === 1;
      },
      async lock(row) {
        const { data, error } = await identity(
          table().update({ state: "applying" }),
          row,
        ).select("user_id");
        return !error && data?.length === 1;
      },
      async save(id, password) {
        const { error } = await admin.auth.admin.updateUserById(id, {
          password,
          email_confirm: true,
        });
        if (error) throw error;
      },
      async finish(row, success) {
        const values = success
          ? {
              state: "used",
              token_hash: null,
              challenge_hash: null,
              challenge_expires_at: null,
            }
          : { state: "claimed" };
        const { data, error } = await table()
          .update(values)
          .eq("user_id", row.user_id)
          .eq("generation", row.generation)
          .eq("version", row.version + 1)
          .eq("state", "applying")
          .select("user_id");
        if (error || data?.length !== 1)
          throw new Error(
            success
              ? "La contraseña se guardó, pero no se confirmó el cierre de la operación. Prueba iniciar sesión y avisa al administrador."
              : "Solicita otra clave temporal al administrador.",
          );
      },
    });
    if (body.action === "start")
      return reply(200, await flow.start(body.email, body.temporary_password));
    if (body.action === "complete")
      return reply(
        200,
        await flow.complete(body.challenge, body.password, body.confirmation),
      );
    return reply(400, { error: "Operación no válida." });
  } catch (error) {
    // No request bodies, credentials, hashes or tokens are written to logs.
    return reply(400, {
      error:
        error instanceof Error
          ? error.message
          : "No se pudo procesar el cambio.",
    });
  }
});
