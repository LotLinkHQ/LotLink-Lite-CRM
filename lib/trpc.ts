import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `/api/trpc`,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}
