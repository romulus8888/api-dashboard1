import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/types/lead";

export interface ProxySupabaseSession {
  client: ReturnType<typeof createServerClient<Database>> | null;
  getAuthResponse: () => NextResponse;
}

export function createProxySupabaseSession(request: NextRequest): ProxySupabaseSession {
  let authResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      client: null,
      getAuthResponse: () => authResponse,
    };
  }

  const client = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        authResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          authResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  return {
    client,
    getAuthResponse: () => authResponse,
  };
}
