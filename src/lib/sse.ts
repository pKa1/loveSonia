type Client = {
  send: (data: string) => void;
  close: () => void;
};

declare global {
  var __sse_clients: Set<Client> | undefined;
}

const clients: Set<Client> = global.__sse_clients ?? new Set<Client>();
if (!global.__sse_clients) global.__sse_clients = clients;

export function registerClient(client: Client) {
  clients.add(client);
}

export function unregisterClient(client: Client) {
  clients.delete(client);
}

export function broadcast(event: string, payload: unknown) {
  const data = `event: ${event}\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    try {
      c.send(data);
    } catch {
      try { c.close(); } catch {}
      clients.delete(c);
    }
  }
}


