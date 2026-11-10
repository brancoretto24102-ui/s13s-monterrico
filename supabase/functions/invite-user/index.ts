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
    const action = String(body.action ?? "invite");
    const reason = String(
      body.reason ?? "Invitación autorizada por administrador",
    ).trim();
    if (
      !["invite", "reset"].includes(action) ||
      reason.length < 8 ||
      reason.length > 2000
    )
      return response(400, {
        error: "Indique una acción y un motivo válidos.",
      });
    const email = String(body.email ?? "").trim(),
      displayName = String(body.display_name ?? "").trim(),
      role = String(body.role ?? "lector"),
      username = String(body.username ?? "").trim(),
      accessMode = String(body.access_mode ?? "base"),
      selected = Array.isArray(body.profile_ids)
        ? [...new Set(body.profile_ids)]
        : [];
    if (
      action === "invite" &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        displayName.length < 1 ||
        displayName.length > 200 ||
        !["administrador", "editor", "lector"].includes(role) ||
        !["base", "custom"].includes(accessMode) ||
        (username && !/^[a-zA-Z0-9_.-]{3,60}$/.test(username)) ||
        (role === "administrador" && accessMode !== "base"))
    )
      return response(400, {
        error: "Revise los datos y el modelo de acceso del usuario.",
      });
    if (action === "invite" && accessMode === "custom") {
      if (
        selected.length < 1 ||
        selected.length > 50 ||
        selected.some(
          (v) => typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v),
        )
      )
        return response(400, {
          error: "Seleccione perfiles personalizados válidos.",
        });
      const { data: available, error: profileError } = await caller
        .from("access_profiles")
        .select("id")
        .in("id", selected)
        .eq("active", true)
        .is("deleted_at", null)
        .is("system_key", null);
      if (profileError || available?.length !== selected.length)
        return response(400, {
          error:
            "Hay perfiles inactivos, eliminados o no disponibles. Revise la selección.",
        });
    }
    if (action === "invite" && username) {
      const { data: existing, error: aliasError } = await caller
        .from("profiles")
        .select("id")
        .eq("username", username.toLowerCase())
        .limit(1);
      if (aliasError || existing?.length)
        return response(400, {
          error: "El alias ya está utilizado o no se pudo validar.",
        });
    }
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
    if (action === "reset") {
      const targetId = String(body.user_id ?? "");
      if (
        !/^[0-9a-f-]{36}$/i.test(targetId) ||
        !Number.isInteger(body.expected_version)
      )
        return response(400, { error: "Usuario o versión no válidos." });
      const { data: target, error: targetError } = await caller
        .from("profiles")
        .select("id,version,deleted_at")
        .eq("id", targetId)
        .single();
      if (
        targetError ||
        !target ||
        target.deleted_at ||
        target.version !== body.expected_version
      )
        return response(409, {
          error: "El usuario cambió o está en Papelera. Actualice la lista.",
        });
      const { data: account, error: accountError } =
        await admin.auth.admin.getUserById(targetId);
      if (accountError || !account.user?.email)
        return response(400, {
          error: "No se pudo localizar el correo autorizado.",
        });
      const { error: resetError } = await admin.auth.resetPasswordForEmail(
        account.user.email,
        { redirectTo: redirect.href },
      );
      if (resetError)
        return response(400, {
          error:
            "No se pudo solicitar el enlace. Revise el servicio de correo y sus límites.",
        });
      const { error: logError } = await caller.rpc("log_access_event", {
        p_id: targetId,
        p_reason: ("Recuperación de contraseña solicitada: " + reason).slice(
          0,
          2000,
        ),
      });
      if (logError)
        return response(409, {
          error:
            "El correo fue solicitado; no se pudo registrar la auditoría. No lo reenvíe sin revisar.",
        });
      return response(200, { recovery_requested: true });
    }
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
    const { error: roleError } = await caller.rpc("manage_user", {
      p_id: invitation.user.id,
      p_expected_version: 1,
      p_name: displayName,
      p_username: username,
      p_role: role,
      p_active: body.active !== false,
      p_can_export: !!body.can_export,
      p_access_mode: accessMode,
      p_profile_ids: accessMode === "custom" ? selected : [],
      p_action: "update",
      p_reason: reason,
    });
    if (roleError)
      return response(409, {
        error:
          "La invitación fue enviada; el usuario sigue inactivo. Revíselo en Usuarios antes de reenviar.",
      });
    return response(200, { invited: true });
  } catch {
    return response(400, { error: "No se pudo procesar la invitación." });
  }
});
