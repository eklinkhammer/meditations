import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, users } from '../db/index.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  creditsBalance: number;
  isPremium: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);

  const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);

  if (error || !supabaseUser) {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  // Find or create user in our database
  let [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, supabaseUser.email!))
    .limit(1);

  if (!dbUser) {
    [dbUser] = await db
      .insert(users)
      .values({
        email: supabaseUser.email!,
        displayName: supabaseUser.user_metadata?.full_name || supabaseUser.email!.split('@')[0],
        authProvider: supabaseUser.app_metadata?.provider || 'email',
      })
      .returning();
  }

  request.user = {
    id: dbUser.id,
    email: dbUser.email,
    displayName: dbUser.displayName,
    role: dbUser.role,
    creditsBalance: dbUser.creditsBalance,
    isPremium: dbUser.isPremium,
  };
}
