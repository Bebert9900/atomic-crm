import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ?? `${SUPABASE_URL}/auth/v1`;

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export type AuthInfo = {
  token: string;
  userId: string;
  tenantId?: string;
  role?: string;
};

export async function validateToken(req: Request): Promise<AuthInfo | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [bearer, token] = header.split(" ");
  if (bearer !== "Bearer" || !token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: SUPABASE_JWT_ISSUER,
    });
    if (!payload.sub) return null;
    return {
      token,
      userId: payload.sub,
      tenantId: payload.tenant_id as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch {
    return null;
  }
}
