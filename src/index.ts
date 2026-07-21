import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toZodSchema } from "./types.ts";
import calendar from "./tools/calendar.ts";
import notes from "./tools/notes.ts";
import contacts from "./tools/contacts.ts";
import doctor from "./tools/doctor.ts";
import { SERVER_NAME, SERVER_VERSION } from "./meta.ts";

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

for (const def of [...calendar, ...notes, ...contacts, ...doctor]) {
  server.registerTool(def.name, {
    description: def.desc,
    inputSchema: toZodSchema(def),
    ...(def.annotations ? { annotations: def.annotations } : {}),
  }, async (raw) => {
    try {
      return { content: [{ type: "text" as const, text: await def.handle(raw as Record<string, unknown>) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }],
        isError: true,
      };
    }
  });
}

await server.connect(new StdioServerTransport());
