import { createClient } from "npm:@supabase/supabase-js@2.119.0";
// Deployed only after the owner approves external configuration.
// Service credentials stay in the function environment, never in VITE_* vars.
Deno.serve(async (req: Request) => {
  const origins = (
    Deno.env.get("ALLOWED_ORIGINS") || "https://brancoretto24102-ui.github.io"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const headers = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  const response = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (!origins.includes(origin))
    return response(403, { error: "Origen no autorizado." });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return response(405, { error: "Método no permitido." });
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = req.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization))
      return response(401, { error: "Sesión inválida." });
    const caller = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return response(401, { error: "Sesión inválida." });
    const { data: profile } = await caller
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .single();
    if (!profile?.active || profile.role !== "administrador")
      return response(403, {
        error: "Solo el administrador puede invitar usuarios.",
      });
    if (Number(req.headers.get("content-length") ?? 0) > 10000)
      return response(413, { error: "Solicitud demasiado grande." });
    const body = await req.json();
    const email = String(body.email ?? "").trim(),
      displayName = String(body.display_name ?? "").trim(),
      role = String(body.role ?? "lector");
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      displayName.length < 1 ||
      displayName.length > 200 ||
      !["administrador", "editor", "lector"].includes(role)
    )
      return response(400, { error: "Revise nombre, correo y rol." });
    const redirect = new URL(String(body.redirectTo));
    const allowedRedirects = (
      Deno.env.get("ALLOWED_REDIRECT_URLS") ||
      "https://brancoretto24102-ui.github.io/s13s-monterrico/"
    )
      .split(",")
      .map((s) => s.trim());
    if (
      redirect.protocol !== "https:" ||
      !allowedRedirects.includes(redirect.href)
    )
      return response(400, { error: "Redirección no autorizada." });
    const admin = createClient(url, secret, {
      auth: { persistSession: false },
    });
    const { data: invitation, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: displayName },
        redirectTo: redirect.href,
      });
    if (inviteError || !invitation.user)
      return response(400, {
        error:
          "No se pudo invitar. Revise si el correo ya existe y los límites de envío.",
      });
    const { error: roleError } = await caller.rpc("manage_profile", {
      p_id: invitation.user.id,
      p_expected_version: 1,
      p_role: role,
      p_active: true,
      p_can_export: !!body.can_export,
      p_reason: `Invitación autorizada por administrador a rol ${role}`,
    });
    if (roleError)
      return response(409, {
        error:
          "La invitación fue enviada; el perfil sigue inactivo. Revíselo en Usuarios antes de reenviar.",
      });
    return response(200, { invited: true });
  } catch {
    return response(400, { error: "No se pudo procesar la invitación." });
  }
});
